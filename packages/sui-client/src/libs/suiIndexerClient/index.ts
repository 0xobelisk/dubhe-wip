import { Http } from '../http';
import { WebSocket } from 'ws';

interface OrderDirection {
  ASC: 'ASC';
  DESC: 'DESC';
}

interface OrderBy {
  field: string;
  direction: OrderDirection['ASC'] | OrderDirection['DESC'];
}

interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
}

interface Transaction {
  id: number;
  checkpoint: number;
  digest: string;
}

interface Schema {
  id: number;
  name: string;
  key1?: string;
  key2?: string;
  value: string;
  last_update_checkpoint: string;
  last_update_digest: string;
  is_removed: boolean;
}

interface Event {
  id: number;
  checkpoint: string;
  digest: string;
  name: string;
  value: string;
}

interface ConnectionResponse<T> {
  edges: Array<{
    cursor: string;
    node: T;
  }>;
  pageInfo: PageInfo;
}

export class SuiIndexerClient {
  private http: Http;

  constructor(http: Http) {
    this.http = http;
  }

  private async fetchGraphql<T>(query: string, variables?: any): Promise<T> {
    return this.http.fetchGraphql({ query, variables });
  }

  async getTransactions(params?: {
    first?: number;
    after?: string;
    last?: number;
    before?: string;
    checkpoint?: number;
    orderBy?: OrderBy;
    distinct?: boolean;
  }) {
    const query = `
      query GetTransactions($first: Int, $after: String, $last: Int, $before: String, $checkpoint: Int, $orderBy: TransactionOrderBy, $distinct: Boolean) {
        transactions(first: $first, after: $after, last: $last, before: $before, checkpoint: $checkpoint, orderBy: $orderBy, distinct: $distinct) {
          edges {
            cursor
            node {
              id
              checkpoint
              digest
            }
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }
    `;

    const response = await this.fetchGraphql<{
      transactions: ConnectionResponse<Transaction>;
    }>(query, params);
    return response.transactions;
  }

  async getSchemas(params?: {
    first?: number;
    after?: string;
    last?: number;
    before?: string;
    name?: string;
    key1?: string;
    key2?: string;
    orderBy?: OrderBy;
    distinct?: boolean;
  }) {
    const query = `
      query GetSchemas($first: Int, $after: String, $last: Int, $before: String, $name: String, $key1: String, $key2: String, $orderBy: SchemaOrderBy, $distinct: Boolean) {
        schemas(first: $first, after: $after, last: $last, before: $before, name: $name, key1: $key1, key2: $key2, orderBy: $orderBy, distinct: $distinct) {
          edges {
            cursor
            node {
              id
              name
              key1
              key2
              value
              last_update_checkpoint
              last_update_digest
              is_removed
            }
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }
    `;

    const response = await this.fetchGraphql<{
      schemas: ConnectionResponse<Schema>;
    }>(query, params);
    return response.schemas;
  }

  async getEvents(params?: {
    first?: number;
    after?: string;
    last?: number;
    before?: string;
    name?: string;
    checkpoint?: string;
    orderBy?: OrderBy;
    distinct?: boolean;
  }) {
    const query = `
      query GetEvents($first: Int, $after: String, $last: Int, $before: String, $name: String, $checkpoint: String, $orderBy: EventOrderBy, $distinct: Boolean) {
        events(first: $first, after: $after, last: $last, before: $before, name: $name, checkpoint: $checkpoint, orderBy: $orderBy, distinct: $distinct) {
          edges {
            cursor
            node {
              id
              checkpoint
              digest
              name
              value
            }
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }
    `;

    const response = await this.fetchGraphql<{
      events: ConnectionResponse<Event>;
    }>(query, params);
    return response.events;
  }

  async getStorage({
    name,
    key1,
    key2,
    first,
    after,
    last,
    before,
    orderBy,
    distinct,
  }: {
    name: string;
    key1?: string;
    key2?: string;
    first?: number;
    after?: string;
    last?: number;
    before?: string;
    orderBy?: OrderBy;
    distinct?: boolean;
  }) {
    const schemas = await this.getSchemas({
      name,
      key1,
      key2,
      first,
      after,
      last,
      before,
      orderBy,
      distinct,
    });

    return schemas;
  }

  async subscribe(names: string[], handleData: (data: any) => void): Promise<WebSocket> {
    return this.http.subscribe(names, handleData);
  }
}
