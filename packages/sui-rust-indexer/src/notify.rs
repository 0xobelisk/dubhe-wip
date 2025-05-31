use diesel_async::RunQueryDsl;
use serde_json::json;
use anyhow::Result;
use crate::db::PgPoolConnection;

#[derive(Clone)]
pub struct NotificationPayload {
    pub event: String,
    pub table: String,
    pub id: Option<serde_json::Value>,
    pub data: Option<serde_json::Value>,
}

impl NotificationPayload {
    pub fn new(event: &str, table: &str) -> Self {
        Self {
            event: event.to_string(),
            table: table.to_string(),
            id: None,
            data: None,
        }
    }

    pub fn with_id(mut self, id: serde_json::Value) -> Self {
        self.id = Some(id);
        self
    }

    pub fn with_data(mut self, data: serde_json::Value) -> Self {
        self.data = Some(data);
        self
    }

    pub fn to_json(&self) -> String {
        json!({
            "event": self.event,
            "table": self.table,
            "id": self.id,
            "data": self.data,
        }).to_string()
    }
}

pub async fn send_notification(
    conn: &mut PgPoolConnection<'_>,
    channel: &str,
    payload: NotificationPayload,
) -> Result<()> {
    let sql = format!(
        "SELECT pg_notify($1, $2)"
    );
    
    diesel::sql_query(sql)
        .bind::<diesel::sql_types::Text, _>(channel)
        .bind::<diesel::sql_types::Text, _>(payload.to_json())
        .execute(conn)
        .await?;
    
    Ok(())
}

// 为 store 表创建通知
pub async fn notify_store_change(
    conn: &mut PgPoolConnection<'_>,
    table_name: &str,
    event: &str,
    key_values: &[(String, serde_json::Value)],
    value_values: &[(String, serde_json::Value)],
) -> Result<()> {
    let channel = format!("store:{}", table_name);
    
    let mut data = json!({});
    
    // 添加键值
    for (key, value) in key_values {
        data[key] = value.clone();
    }
    
    // 添加普通值
    for (key, value) in value_values {
        data[key] = value.clone();
    }
    
    let payload = NotificationPayload::new(event, &format!("store_{}", table_name))
        .with_data(data);
    
    send_notification(conn, &channel, payload.clone()).await?;
    
    // 也发送到通用频道
    send_notification(conn, "store:all", payload).await?;
    
    Ok(())
}

// 创建触发器函数和触发器
pub async fn setup_notification_triggers(conn: &mut PgPoolConnection<'_>) -> Result<()> {
    // 创建通用的触发器函数
    let create_function = r#"
    CREATE OR REPLACE FUNCTION tg__graphql_subscription() RETURNS trigger AS $$
    DECLARE
        v_process_new bool = (TG_OP = 'INSERT' OR TG_OP = 'UPDATE');
        v_process_old bool = (TG_OP = 'UPDATE' OR TG_OP = 'DELETE');
        v_event text = TG_ARGV[0];
        v_topic_template text = TG_ARGV[1];
        v_attribute text = TG_ARGV[2];
        v_record record;
        v_sub text;
        v_topic text;
        v_i int = 0;
        v_last_topic text;
        v_payload jsonb;
    BEGIN
        -- 处理 NEW 和 OLD 记录
        FOR v_i IN 0..1 LOOP
            IF (v_i = 0) AND v_process_new IS TRUE THEN
                v_record = NEW;
            ELSIF (v_i = 1) AND v_process_old IS TRUE THEN
                v_record = OLD;
            ELSE
                CONTINUE;
            END IF;
            
            -- 获取订阅属性值
            IF v_attribute IS NOT NULL THEN
                EXECUTE 'SELECT $1.' || quote_ident(v_attribute)
                    USING v_record
                    INTO v_sub;
            END IF;
            
            -- 构建主题
            IF v_sub IS NOT NULL THEN
                v_topic = replace(v_topic_template, '$1', v_sub);
            ELSE
                v_topic = v_topic_template;
            END IF;
            
            -- 避免重复通知
            IF v_topic IS DISTINCT FROM v_last_topic THEN
                v_last_topic = v_topic;
                
                -- 构建简化的 payload
                v_payload = jsonb_build_object(
                    'event', v_event,
                    'table', TG_TABLE_NAME,
                    'schema', TG_TABLE_SCHEMA,
                    'data', to_jsonb(v_record),
                    'timestamp', current_timestamp
                );
                
                PERFORM pg_notify(v_topic, v_payload::text);
            END IF;
        END LOOP;
        
        RETURN v_record;
    END;
    $$ LANGUAGE plpgsql VOLATILE;
    "#;
    
    diesel::sql_query(create_function)
        .execute(conn)
        .await?;
    
    println!("Notification trigger function created successfully");
    
    Ok(())
}

// 为特定表创建触发器
pub async fn create_table_trigger(
    conn: &mut PgPoolConnection<'_>,
    table_name: &str,
    operations: &[&str], // ["INSERT", "UPDATE", "DELETE"]
) -> Result<()> {
    let trigger_name = format!("_notify_{}", table_name);
    let ops = operations.join(" OR ");
    
    // 先删除旧触发器（如果存在）
    let drop_trigger = format!(
        "DROP TRIGGER IF EXISTS {} ON {}",
        trigger_name, table_name
    );
    diesel::sql_query(&drop_trigger)
        .execute(conn)
        .await?;
    
    // 创建新触发器
    let create_trigger = format!(
        r#"CREATE TRIGGER {}
        AFTER {}
        ON {}
        FOR EACH ROW
        EXECUTE FUNCTION tg__graphql_subscription(
            '{}',  -- event (create/update/delete)
            '{}',  -- topic template
            NULL   -- attribute (可选)
        )"#,
        trigger_name,
        ops,
        table_name,
        if operations.contains(&"INSERT") { "create" } 
        else if operations.contains(&"UPDATE") { "update" } 
        else { "delete" },
        format!("table:{}:change", table_name)
    );
    
    diesel::sql_query(&create_trigger)
        .execute(conn)
        .await?;
    
    println!("Trigger created for table: {}", table_name);
    
    Ok(())
} 