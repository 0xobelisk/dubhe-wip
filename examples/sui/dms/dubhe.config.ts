import { DubheConfig } from '@0xobelisk/sui-common';

export const dubheConfig = {
	name: 'dms',
	description: 'distributed message',
	data: { },
	errors: {
		MessageTooLong: "Message is too long",
	},
	events: {
		MessageSet: {
			sender: 'address',
			message: 'String',
		}
	},
	schemas: {
		mailbox: {
			world_message: 'StorageValue<String>',
			private_message: 'StorageMap<address, String>',
		},
	},
} as DubheConfig;
