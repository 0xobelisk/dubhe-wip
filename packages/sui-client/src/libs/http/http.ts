import { WebSocket } from 'ws';
import { BaseError, HttpError, GraphQLError, ParseError } from './errors';

export type FetchOptions = RequestInit & {
  next?: {
    revalidate?: boolean | number;
  };
};

export class Http {
  private apiEndpoint: string;
  private graphqlEndpoint: string;
  private wsEndpoint: string;
  private defaultOptions?: FetchOptions;

  constructor(
    apiEndpoint: string,
    wsEndpoint: string,
    private customFetch?: typeof fetch,
    defaultOptions?: FetchOptions
  ) {
    this.apiEndpoint = apiEndpoint;
    this.graphqlEndpoint = apiEndpoint + '/graphql';
    this.wsEndpoint = wsEndpoint;
    this.defaultOptions = defaultOptions;
  }

  private getFetch() {
    return this.customFetch || fetch;
  }

  async fetch(url: string): Promise<Response> {
    try {
      const fetchFn = this.getFetch();
      const response = await fetchFn(url, {
        ...this.defaultOptions,
      });

      if (!response.ok) {
        throw new HttpError(
          `HTTP error! status: ${response.status}`,
          response.status
        );
      }

      return response;
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      throw new HttpError(`Failed to fetch: ${(error as Error).message}`, 500);
    }
  }

  async fetchGraphql<T>({
    query,
    variables,
  }: {
    query: string;
    variables?: any;
  }): Promise<T> {
    try {
      const isFirstPage = variables?.after === 'first';
      const fetchFn = this.getFetch();
      console.log(query);
      const response = await fetchFn(this.graphqlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: {
            ...variables,
            after: isFirstPage ? undefined : variables?.after,
          },
        }),
        ...this.defaultOptions,
      });

      if (!response.ok) {
        const errorData = await response.json();

        if (errorData.errors?.[0]?.message?.includes('Syntax Error')) {
          throw new GraphQLError(
            `GraphQL syntax error: ${errorData.errors[0].message}`
          );
        }

        if (errorData.errors?.length > 0) {
          throw new GraphQLError(
            errorData.errors[0].message || 'Unknown GraphQL error'
          );
        }

        throw new HttpError(
          `HTTP error: ${JSON.stringify(errorData)}`,
          response.status
        );
      }
      const data = await response.json();

      if (data.errors) {
        throw new GraphQLError(
          data.errors[0]?.message || 'GraphQL query failed'
        );
      }

      return data.data;
    } catch (error) {
      console.log(error);
      if (error instanceof BaseError) {
        throw error;
      }
      if (error instanceof SyntaxError) {
        throw new ParseError('Failed to parse JSON response');
      }
      throw new HttpError(
        `Failed to fetch GraphQL: ${(error as Error).message}`,
        500
      );
    }
  }

  async subscribe(names: string[], handleData: (data: any) => void) {
    const ws = new WebSocket(this.wsEndpoint);

    ws.on('open', () => {
      console.log('Connected to the WebSocket server');
      // Subscribe to specific event names
      const subscribeMessage = JSON.stringify({
        type: 'subscribe',
        names: names,
      });
      ws.send(subscribeMessage);
    });

    ws.on('message', (data) => {
      handleData(JSON.parse(data.toString()));
    });

    ws.on('close', () => {
      console.log('Disconnected from the WebSocket server');
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error: ${error}`);
    });
  }
}
