import { DubheConfig } from '@0xobelisk/sui-common';

export const dubheConfig = {
	name: 'counter',
	description: 'counter contract',
	schemas: {
		counter: {
			structure: {
				value: 'StorageValue<u32>',
			},
			events: [
				{
					name: 'Increment',
					fields: {
						value: 'u32',
					},
				},
			],
			errors: [
				{
					name: 'InvalidIncrement',
					message: "Number can't be incremented, must be more than 0",
				},
			]
		},
	},
} as DubheConfig;
