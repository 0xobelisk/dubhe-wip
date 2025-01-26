import { Middleware } from 'koa';
import Router from '@koa/router';
import compose from 'koa-compose';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { createYoga } from 'graphql-yoga';
import { createSchema } from './graphqlSchema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function apiRoutes(
	database: BaseSQLiteDatabase<'sync', any>,
	defaultPageSize: number,
	paginationLimit: number
): Middleware {
	const router = new Router();

	// router.get('/api/logs', compress(), async ctx => {
	// 	const benchmark = createBenchmark('sqlite:logs');

	// 	let options: ReturnType<typeof input.parse>;

	// 	try {
	// 		options = input.parse(
	// 			typeof ctx.query.input === 'string'
	// 				? JSON.parse(ctx.query.input)
	// 				: {}
	// 		);
	// 	} catch (error) {
	// 		ctx.status = 400;
	// 		ctx.body = JSON.stringify(error);
	// 		debug(error);
	// 		return;
	// 	}

	// 	try {
	// 		options.filters =
	// 			options.filters.length > 0
	// 				? [...options.filters, { tableId: schemasTable.tableId }]
	// 				: [];
	// 		benchmark('parse config');
	// 		const { blockNumber, tables } = getTablesWithRecords(
	// 			database,
	// 			options
	// 		);
	// 		benchmark('query tables with records');
	// 		const logs = tablesWithRecordsToLogs(tables);
	// 		benchmark('convert records to logs');

	// 		ctx.body = JSON.stringify({
	// 			blockNumber: blockNumber?.toString() ?? '-1',
	// 			logs,
	// 		});
	// 		ctx.status = 200;
	// 	} catch (error) {
	// 		ctx.status = 500;
	// 		ctx.body = JSON.stringify(error);
	// 		debug(error);
	// 	}
	// });

	const yoga = createYoga({
		schema: createSchema(database, defaultPageSize, paginationLimit),
		graphqlEndpoint: '/graphql',
		landingPage: true,
		cors: true,
	});

	router.all('/graphql', async ctx => {
		const response = await yoga.handle(ctx.req, ctx.res);
		ctx.respond = false;
		return response;
	});

	return compose([router.routes(), router.allowedMethods()]) as Middleware;
}
