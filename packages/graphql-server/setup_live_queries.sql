-- 为PostGraphile Live Queries设置数据库触发器
-- 这个脚本创建必要的函数和触发器来支持实时数据变更通知

-- 1. 创建通用的GraphQL订阅通知函数
CREATE OR REPLACE FUNCTION public.tg__graphql_subscription() 
RETURNS TRIGGER AS $$
DECLARE
  v_process_new BOOLEAN = (TG_OP = 'INSERT' OR TG_OP = 'UPDATE');
  v_process_old BOOLEAN = (TG_OP = 'UPDATE' OR TG_OP = 'DELETE');
  v_event TEXT = TG_ARGV[0];
  v_topic_template TEXT = TG_ARGV[1];
  v_attribute TEXT = TG_ARGV[2];
  v_record RECORD;
  v_sub TEXT;
  v_topic TEXT;
  v_i INTEGER = 0;
  v_last_topic TEXT;
BEGIN
  -- 处理新旧记录
  FOR v_i IN 0..1 LOOP
    IF (v_i = 0) AND v_process_new IS TRUE THEN
      v_record = NEW;
    ELSIF (v_i = 1) AND v_process_old IS TRUE THEN
      v_record = OLD;
    ELSE
      CONTINUE;
    END IF;
    
    IF v_attribute IS NOT NULL THEN
      EXECUTE 'SELECT $1.' || quote_ident(v_attribute)
        USING v_record
        INTO v_sub;
    END IF;
    
    IF v_sub IS NOT NULL THEN
      v_topic = REPLACE(v_topic_template, '$1', v_sub);
    ELSE
      v_topic = v_topic_template;
    END IF;
    
    IF v_topic IS DISTINCT FROM v_last_topic THEN
      v_last_topic = v_topic;
      PERFORM pg_notify(v_topic, json_build_object(
        'event', v_event,
        'subject', v_sub,
        'table', TG_TABLE_NAME,
        'schema', TG_TABLE_SCHEMA
      )::TEXT);
    END IF;
  END LOOP;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql VOLATILE SET search_path FROM CURRENT;

-- 2. 为store_encounter表创建触发器
DROP TRIGGER IF EXISTS _500_gql_encounter_change ON store_encounter;
CREATE TRIGGER _500_gql_encounter_change
  AFTER INSERT OR UPDATE OR DELETE ON store_encounter
  FOR EACH ROW
  EXECUTE FUNCTION public.tg__graphql_subscription(
    'encounterChanged',     -- event名称
    'postgraphile:encounter', -- topic前缀
    'player'                -- 标识字段
  );

-- 3. 为其他store表创建类似的触发器
DROP TRIGGER IF EXISTS _500_gql_accounts_change ON store_accounts;
CREATE TRIGGER _500_gql_accounts_change
  AFTER INSERT OR UPDATE OR DELETE ON store_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.tg__graphql_subscription(
    'accountsChanged',
    'postgraphile:accounts',
    'account'
  );

DROP TRIGGER IF EXISTS _500_gql_position_change ON store_position;
CREATE TRIGGER _500_gql_position_change
  AFTER INSERT OR UPDATE OR DELETE ON store_position
  FOR EACH ROW
  EXECUTE FUNCTION public.tg__graphql_subscription(
    'positionChanged',
    'postgraphile:position',
    'player'
  );

DROP TRIGGER IF EXISTS _500_gql_map_config_change ON store_map_config;
CREATE TRIGGER _500_gql_map_config_change
  AFTER INSERT OR UPDATE OR DELETE ON store_map_config
  FOR EACH ROW
  EXECUTE FUNCTION public.tg__graphql_subscription(
    'mapConfigChanged',
    'postgraphile:mapconfig',
    'config_key'
  );

-- 4. 创建一个通用的数据变更通知触发器（用于Live Queries）
CREATE OR REPLACE FUNCTION public.tg__notify_watchers_ddl() 
RETURNS event_trigger AS $$
BEGIN
  PERFORM pg_notify(
    'postgraphile:schema_change',
    json_build_object(
      'type', 'ddl'
    )::TEXT
  );
END;
$$ LANGUAGE plpgsql;

-- 5. 创建一个简化的实时通知函数（专门为Live Queries设计）
CREATE OR REPLACE FUNCTION public.tg__live_query_notify() 
RETURNS TRIGGER AS $$
BEGIN
  -- 为Live Queries发送通知
  PERFORM pg_notify(
    'postgraphile:table:' || TG_TABLE_NAME,
    json_build_object(
      'op', TG_OP,
      'schema', TG_TABLE_SCHEMA,
      'table', TG_TABLE_NAME,
      'id', CASE 
        WHEN TG_OP = 'DELETE' THEN OLD.player
        ELSE NEW.player
      END
    )::TEXT
  );
  
  -- 也发送到通用频道
  PERFORM pg_notify(
    'postgraphile:live_update',
    json_build_object(
      'table', TG_TABLE_NAME,
      'op', TG_OP
    )::TEXT
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 6. 为所有store表添加Live Query触发器
DROP TRIGGER IF EXISTS _live_query_encounter ON store_encounter;
CREATE TRIGGER _live_query_encounter
  AFTER INSERT OR UPDATE OR DELETE ON store_encounter
  FOR EACH ROW
  EXECUTE FUNCTION public.tg__live_query_notify();

DROP TRIGGER IF EXISTS _live_query_accounts ON store_accounts;
CREATE TRIGGER _live_query_accounts
  AFTER INSERT OR UPDATE OR DELETE ON store_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.tg__live_query_notify();

DROP TRIGGER IF EXISTS _live_query_position ON store_position;
CREATE TRIGGER _live_query_position
  AFTER INSERT OR UPDATE OR DELETE ON store_position
  FOR EACH ROW
  EXECUTE FUNCTION public.tg__live_query_notify();

DROP TRIGGER IF EXISTS _live_query_map_config ON store_map_config;
CREATE TRIGGER _live_query_map_config
  AFTER INSERT OR UPDATE OR DELETE ON store_map_config
  FOR EACH ROW
  EXECUTE FUNCTION public.tg__live_query_notify();

-- 7. 验证触发器是否创建成功
SELECT 
  t.tgname as trigger_name,
  c.relname as table_name,
  t.tgenabled as enabled
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE c.relname LIKE 'store_%'
ORDER BY c.relname, t.tgname; 