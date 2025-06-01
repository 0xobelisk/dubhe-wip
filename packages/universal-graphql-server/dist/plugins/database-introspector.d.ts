import { Pool } from 'pg';
export interface TableField {
    field_name: string;
    field_type: string;
    field_index: number | null;
    is_key: boolean;
}
export interface DynamicTable {
    table_name: string;
    fields: TableField[];
}
export declare class DatabaseIntrospector {
    private pool;
    private schema;
    constructor(pool: Pool, schema?: string);
    getStoreTables(): Promise<string[]>;
    getSystemTables(): Promise<string[]>;
    getDynamicTableFields(tableName: string): Promise<TableField[]>;
    getSystemTableFields(tableName: string): Promise<TableField[]>;
    getAllTables(): Promise<DynamicTable[]>;
    testConnection(): Promise<boolean>;
    logTableInfo(tables: DynamicTable[]): void;
}
//# sourceMappingURL=database-introspector.d.ts.map