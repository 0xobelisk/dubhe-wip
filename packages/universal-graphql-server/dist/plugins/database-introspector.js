"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseIntrospector = void 0;
// 扫描数据库表结构
class DatabaseIntrospector {
    pool;
    schema;
    constructor(pool, schema = 'public') {
        this.pool = pool;
        this.schema = schema;
    }
    // 获取所有动态创建的 store_* 表
    async getStoreTables() {
        const result = await this.pool.query(`
			SELECT table_name 
			FROM information_schema.tables 
			WHERE table_schema = $1 
				AND table_name LIKE 'store_%'
			ORDER BY table_name
		`, [this.schema]);
        return result.rows.map(row => row.table_name);
    }
    // 获取系统表（dubhe 相关表）
    async getSystemTables() {
        const result = await this.pool.query(`
			SELECT table_name 
			FROM information_schema.tables 
			WHERE table_schema = $1 
				AND (table_name LIKE '__dubhe%' OR table_name = 'table_fields')
			ORDER BY table_name
		`, [this.schema]);
        return result.rows.map(row => row.table_name);
    }
    // 从 table_fields 表获取动态表的字段信息
    async getDynamicTableFields(tableName) {
        // 提取表名（去掉 store_ 前缀）
        const baseTableName = tableName.replace('store_', '');
        const result = await this.pool.query(`
			SELECT field_name, field_type, field_index, is_key
			FROM table_fields 
			WHERE table_name = $1
			ORDER BY is_key DESC, field_index ASC
		`, [baseTableName]);
        return result.rows;
    }
    // 从系统表获取字段信息
    async getSystemTableFields(tableName) {
        const result = await this.pool.query(`
			SELECT 
				column_name as field_name,
				data_type as field_type,
				ordinal_position as field_index,
				CASE WHEN column_name = 'id' THEN true ELSE false END as is_key
			FROM information_schema.columns 
			WHERE table_schema = $1 AND table_name = $2
			ORDER BY ordinal_position
		`, [this.schema, tableName]);
        return result.rows;
    }
    // 获取所有表的完整信息
    async getAllTables() {
        const storeTables = await this.getStoreTables();
        const systemTables = await this.getSystemTables();
        const allTables = [];
        // 处理动态表
        for (const tableName of storeTables) {
            const fields = await this.getDynamicTableFields(tableName);
            allTables.push({
                table_name: tableName,
                fields,
            });
        }
        // 处理系统表
        for (const tableName of systemTables) {
            const fields = await this.getSystemTableFields(tableName);
            allTables.push({
                table_name: tableName,
                fields,
            });
        }
        return allTables;
    }
    // 测试数据库连接
    async testConnection() {
        try {
            await this.pool.query('SELECT NOW() as current_time');
            return true;
        }
        catch (error) {
            console.error('数据库连接测试失败:', error);
            return false;
        }
    }
    // 输出表结构信息到控制台
    logTableInfo(tables) {
        console.log('📊 发现的表：');
        tables.forEach(table => {
            const keyFields = table.fields
                .filter(f => f.is_key)
                .map(f => f.field_name);
            const valueFields = table.fields
                .filter(f => !f.is_key)
                .map(f => f.field_name);
            console.log(`  - ${table.table_name}`);
            console.log(`    键字段: [${keyFields.join(', ')}]`);
            console.log(`    值字段: [${valueFields.join(', ')}]`);
        });
    }
}
exports.DatabaseIntrospector = DatabaseIntrospector;
//# sourceMappingURL=database-introspector.js.map