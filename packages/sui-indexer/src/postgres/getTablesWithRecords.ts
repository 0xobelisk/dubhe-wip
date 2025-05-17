import { and, eq, desc } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { Hex } from 'viem';
import { SyncFilter, TableWithRecords } from '@latticexyz/store-sync';
import { dubheStoreSchemas } from './tables';

/**
 * 获取数据库中的表和记录信息 - PostgreSQL版本
 */
export async function getTablesWithRecords(
  database: PostgresJsDatabase<Record<string, unknown>>,
  {
    chainId,
    address,
    filters = []
  }: {
    readonly chainId: number;
    readonly address?: Hex;
    readonly filters?: readonly SyncFilter[];
  }
): Promise<{ blockNumber: bigint | null; tables: readonly TableWithRecords[] }> {
  // 获取最新区块号 - 在实际实现中应从某个配置表中获取
  const blockNumber = BigInt(chainId);

  // 处理过滤器
  const tableIds = Array.from(new Set(filters.map((filter) => filter.tableId)));

  // 构建表名查询条件
  const conditions = [];

  if (tableIds.length > 0) {
    // 在实际实现中应该构建适当的过滤条件
    conditions.push(eq(dubheStoreSchemas.name, tableIds[0]));
  }

  // 查询数据库
  let query = database.select().from(dubheStoreSchemas);

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  const schemas = await query.orderBy(desc(dubheStoreSchemas.created_at)).execute();

  // 构建表结构 - 先转为unknown类型再转为TableWithRecords
  const tablesWithRecords = schemas.map((schema) => {
    // 为每个schema创建一个表结构
    const tableData = {
      id: schema.id,
      name: schema.name,
      address: address || ('0x' as Hex),
      tableId: schema.name as Hex,
      namespace: '', // 添加缺失的namespace属性
      keySchema: { key1: 'bytes32', key2: 'bytes32' },
      valueSchema: { value: 'bytes' },
      type: 'schema' as string,
      schema: {
        key1: { type: 'bytes32', internalType: 'bytes32' },
        key2: { type: 'bytes32', internalType: 'bytes32' },
        value: { type: 'bytes', internalType: 'bytes' }
      },
      key: ['key1', 'key2'],
      records: [
        {
          key: { key1: schema.key1, key2: schema.key2 },
          value: { value: schema.value },
          fields: {
            key1: schema.key1,
            key2: schema.key2,
            value: schema.value
          }
        }
      ]
    };

    return tableData as unknown as TableWithRecords;
  });

  return {
    blockNumber,
    tables: tablesWithRecords
  };
}
