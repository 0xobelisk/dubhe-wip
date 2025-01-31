interface TransactionBlockEvent {
	contents: {
		json: Record<string, any>;
	};
}

interface TransactionBlockEffects {
	timestamp: string;
	checkpoint: {
		sequenceNumber: number;
	};
	events: {
		nodes: TransactionBlockEvent[];
	};
}

interface TransactionBlock {
	digest: string;
	effects: TransactionBlockEffects;
}

interface PageInfo {
	hasNextPage: boolean;
	endCursor: string;
}

interface TransactionBlocksResponse {
	transactionBlocks: {
		edges: Array<{
			cursor: string;
			node: TransactionBlock;
		}>;
		pageInfo: PageInfo;
	};
}

interface EventResponse {
	events: {
		nodes: TransactionBlockEvent[];
		pageInfo: PageInfo;
	};
}

const queryTransactionBlocks = `
query TransactionBlocks($first: Int!, $after: String, $filter: TransactionBlockFilter) {
	transactionBlocks(
		first: $first,
		after: $after,
		filter: $filter,
	) {
		edges {
            cursor
			node {
				digest
				effects {
					timestamp
					checkpoint {
						sequenceNumber
					}
					events {
						nodes {
							contents {
								json
							}
						}
					}
				}
			}
		}
		pageInfo {
			hasNextPage
			endCursor
		}
	}
}
`;

const queryEvents = `
query Events($first: Int!, $after: String, $filter: EventFilter) {
	events(
		first: $first,
		after: $after,
		filter: $filter
	) {
        nodes {
            contents {
                json
            }
        }
		pageInfo {
			hasNextPage
			endCursor
		}
	}
}
`;

export async function fetchGraphql<T>({
	graphqlEndpoint,
	query,
	variables,
}: {
	graphqlEndpoint: string;
	query: string;
	variables?: any;
}): Promise<T> {
	try {
		const isFirstPage = variables?.after === 'first';
		const response = await fetch(graphqlEndpoint, {
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
		});

		if (!response.ok) {
			const errorData = await response.json();

			if (errorData.errors?.[0]?.message?.includes('Syntax Error')) {
				throw new Error(
					`GraphQL syntax error: ${errorData.errors[0].message}`
				);
			}

			if (errorData.errors?.length > 0) {
				throw new Error(
					errorData.errors[0].message || 'Unknown GraphQL error'
				);
			}

			throw new Error(
				`HTTP error: ${JSON.stringify(errorData)} (status: ${
					response.status
				})`
			);
		}
		const data = await response.json();

		if (data.errors) {
			throw new Error(data.errors[0]?.message || 'GraphQL query failed');
		}

		return data.data;
	} catch (error) {
		throw error;
	}
}

export async function fetchTransactionBlocks({
	graphqlEndpoint,
	changedObject,
	first,
	after,
	afterCheckpoint,
}: {
	graphqlEndpoint: string;
	changedObject: string;
	first: number;
	after?: string;
	afterCheckpoint?: number;
}): Promise<TransactionBlocksResponse> {
	const variables = {
		first,
		after,
		filter: {
			changedObject,
			afterCheckpoint,
		},
	};

	try {
		const response = await fetch(graphqlEndpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				query: queryTransactionBlocks,
				variables,
			}),
		});

		if (!response.ok) {
			throw new Error(`GraphQL request failed: ${response.statusText}`);
		}

		const json = await response.json();
		if (json.errors) {
			console.error('GraphQL errors:', json.errors);
			throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
		}

		return json.data;
	} catch (error) {
		console.error('Failed to fetch transaction blocks:', error);
		throw error;
	}
}

export async function fetchEvents({
	graphqlEndpoint,
	transactionDigest,
	first = 50,
	after,
}: {
	graphqlEndpoint: string;
	transactionDigest: string;
	first?: number;
	after?: string;
}): Promise<EventResponse> {
	const variables = {
		first,
		after,
		filter: {
			transactionDigest,
		},
	};

	return fetchGraphql<EventResponse>({
		graphqlEndpoint,
		query: queryEvents,
		variables,
	});
}

export async function fetchAllEvents({
	graphqlEndpoint,
	transactionDigest,
	batchSize = 50,
}: {
	graphqlEndpoint: string;
	transactionDigest: string;
	batchSize?: number;
}): Promise<TransactionBlockEvent[]> {
	let allEvents: TransactionBlockEvent[] = [];
	let hasNextPage = true;
	let cursor: string | undefined;

	while (hasNextPage) {
		const response = await fetchEvents({
			graphqlEndpoint,
			transactionDigest,
			first: batchSize,
			after: cursor,
		});

		allEvents = allEvents.concat(response.events.nodes);
		hasNextPage = response.events.pageInfo.hasNextPage;
		cursor = response.events.pageInfo.endCursor;
	}

	return allEvents;
}
