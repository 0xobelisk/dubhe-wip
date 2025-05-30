import { asc, eq } from 'drizzle-orm';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { buildTable, chainState, getTables } from '@latticexyz/store-sync/sqlite';
import { Hex, getAddress } from 'viem';
import { decodeDynamicField } from '@latticexyz/protocol-parser/internal';
import { SyncFilter, TableRecord, TableWithRecords } from '@latticexyz/store-sync';
import { hexToResource } from '@latticexyz/common';
import { mapObject } from '@latticexyz/common/utils';

/**
 * @deprecated
 * */
export function getTablesWithRecords(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  database: BaseSQLiteDatabase<'sync', any>,
  {
    chainId,
    address,
    filters = []
  }: {
    readonly chainId: number;
    readonly address?: Hex;
    readonly filters?: readonly SyncFilter[];
  }
): { blockNumber: bigint | null; tables: readonly TableWithRecords[] } {
  const metadata = database
    .select()
    .from(chainState)
    .where(eq(chainState.chainId, chainId))
    .limit(1)
    .all()
    .find(() => true);

  // If _any_ filter has a table ID, this will filter down all data to just those tables. Which mean we can't yet mix table filters with key-only filters.
  // TODO: improve this so we can express this in the query (need to be able to query data across tables more easily)
  const tableIds = Array.from(new Set(filters.map((filter) => filter.tableId)));
  const tables = getTables(database)
    .filter((table) => address == null || getAddress(address) === getAddress(table.address))
    .filter((table) => !tableIds.length || tableIds.includes(table.tableId));

  const tablesWithRecords = tables.map((table) => {
    const sqliteTable = buildTable(table);
    const records = database
      .select()
      .from(sqliteTable)
      .where(eq(sqliteTable.__isDeleted, false))
      .orderBy(asc(sqliteTable.__lastUpdatedBlockNumber))
      .all();
    const filteredRecords = !filters.length
      ? records
      : records.filter((record) => {
          const keyTuple = decodeDynamicField('bytes32[]', record.__key);
          return filters.some(
            (filter) =>
              filter.tableId === table.tableId &&
              (filter.key0 == null || filter.key0 === keyTuple[0]) &&
              (filter.key1 == null || filter.key1 === keyTuple[1])
          );
        });
    const resource = hexToResource(table.tableId);
    return {
      ...table,
      type: resource.type as never,
      schema: mapObject({ ...table.keySchema, ...table.valueSchema }, (type) => ({
        type,
        internalType: type
      })),
      key: Object.keys(table.keySchema),
      records: filteredRecords.map((record): TableRecord => {
        const key = Object.fromEntries(
          Object.entries(table.keySchema).map(([name]) => [name, record[name]])
        );
        const value = Object.fromEntries(
          Object.entries(table.valueSchema).map(([name]) => [name, record[name]])
        );
        return { key, value, fields: { ...key, ...value } };
      })
    } satisfies TableWithRecords;
  });

  return {
    blockNumber: metadata?.lastUpdatedBlockNumber ?? null,
    tables: tablesWithRecords
  };
}
