use crate::db::PgPoolConnection;
use anyhow::Result;

// 简化的数据变更日志记录
pub async fn log_data_change(
    _conn: &mut PgPoolConnection<'_>,
    table_name: &str,
    operation: &str,
    record_count: usize,
) -> Result<()> {
    println!(
        "📊 数据变更: 表={}, 操作={}, 记录数={}",
        table_name, operation, record_count
    );

    // PostGraphile的Live Queries会自动检测数据库变更
    // 不需要手动发送通知

    Ok(())
}

// 简化的触发器设置 - 可选，用于调试
pub async fn setup_simple_logging(conn: &mut PgPoolConnection<'_>) -> Result<()> {
    // 只在需要调试时创建简单的日志函数
    let create_log_function = r#"
    CREATE OR REPLACE FUNCTION simple_change_log() RETURNS trigger AS $$
    BEGIN
        -- 简单的变更日志，可用于调试
        RAISE NOTICE 'Table % operation % completed', TG_TABLE_NAME, TG_OP;
        
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END;
    $$ LANGUAGE plpgsql;
    "#;

    use diesel_async::RunQueryDsl;
    diesel::sql_query(create_log_function).execute(conn).await?;

    println!("✅ 简化日志函数已创建");

    Ok(())
}

// 为统一实时引擎创建数据变更通知触发器
pub async fn create_realtime_trigger(
    conn: &mut PgPoolConnection<'_>,
    table_name: &str,
) -> Result<()> {
    // 创建通用的触发器函数 - 根据table_fields配置动态处理主键
    let create_notify_function = r#"
    CREATE OR REPLACE FUNCTION unified_realtime_notify() RETURNS trigger AS $$
    DECLARE
        channel_name text;
        payload_data jsonb;
        primary_key_value text;
        key_fields text[];
        key_values text[];
        table_name_without_prefix text;
        current_field_name text;
        current_field_value text;
    BEGIN
        -- 构建通道名称：使用PostGraphile兼容格式
        channel_name := 'postgraphile:' || TG_TABLE_NAME;
        
        -- 提取表名，去掉store_前缀
        IF TG_TABLE_NAME LIKE 'store_%' THEN
            table_name_without_prefix := substring(TG_TABLE_NAME from 7);
        ELSE
            table_name_without_prefix := TG_TABLE_NAME;
        END IF;
        
        -- 动态获取主键字段列表
        SELECT array_agg(table_fields.field_name ORDER BY table_fields.field_name) 
        INTO key_fields
        FROM table_fields 
        WHERE table_fields.table_name = table_name_without_prefix AND table_fields.is_key = true;
        
        -- 构建主键值
        key_values := ARRAY[]::text[];
        
        IF key_fields IS NOT NULL THEN
            FOREACH current_field_name IN ARRAY key_fields
            LOOP
                BEGIN
                    IF TG_OP = 'DELETE' THEN
                        -- 动态获取OLD记录的字段值
                        EXECUTE format('SELECT ($1).%I::text', current_field_name) INTO current_field_value USING OLD;
                    ELSE
                        -- 动态获取NEW记录的字段值
                        EXECUTE format('SELECT ($1).%I::text', current_field_name) INTO current_field_value USING NEW;
                    END IF;
                    
                    key_values := key_values || current_field_value;
                EXCEPTION 
                    WHEN undefined_column THEN
                        key_values := key_values || 'NULL';
                    WHEN OTHERS THEN
                        key_values := key_values || 'ERROR';
                END;
            END LOOP;
            
            -- 组合主键值 (用下划线连接多个字段)
            primary_key_value := array_to_string(key_values, '_');
        ELSE
            -- 如果没有主键字段，使用表名作为标识
            primary_key_value := 'no_key_' || table_name_without_prefix;
        END IF;
        
        -- 构建PostGraphile Live Queries专用载荷格式
        -- PostGraphile需要知道发生了变化，以便重新执行live queries
        
        -- 1. 发送到标准的postgraphile频道（简单格式）
        PERFORM pg_notify('postgraphile:' || TG_TABLE_NAME, '{}');
        
        -- 2. 发送到DDL频道通知schema可能发生变化
        PERFORM pg_notify('postgraphile:ddl', '{"table":"' || TG_TABLE_NAME || '","op":"' || TG_OP || '"}');
        
        -- 3. 发送到query invalidation频道（PostGraphile专用）
        PERFORM pg_notify('postgraphile:query_invalidation', '{"table":"' || TG_TABLE_NAME || '"}');
        
        -- 4. 发送到table-specific频道
        PERFORM pg_notify('postgraphile:table:' || TG_TABLE_NAME, '{"op":"' || TG_OP || '"}');
        
        -- 返回适当的记录
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END;
    $$ LANGUAGE plpgsql VOLATILE;
    "#;

    use diesel_async::RunQueryDsl;
    diesel::sql_query(create_notify_function)
        .execute(conn)
        .await?;

    let trigger_name = format!("_unified_realtime_{}", table_name);

    // 删除旧触发器
    let drop_trigger = format!("DROP TRIGGER IF EXISTS {} ON {}", trigger_name, table_name);

    diesel::sql_query(&drop_trigger).execute(conn).await?;

    // 创建统一实时引擎触发器
    let create_trigger = format!(
        r#"CREATE TRIGGER {}
        AFTER INSERT OR UPDATE OR DELETE
        ON {}
        FOR EACH ROW
        EXECUTE FUNCTION unified_realtime_notify()"#,
        trigger_name, table_name
    );

    diesel::sql_query(&create_trigger).execute(conn).await?;

    println!("✅ 统一实时引擎触发器已创建: {}", table_name);

    Ok(())
}
