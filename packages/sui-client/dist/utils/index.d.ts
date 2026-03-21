import { BasicBcsTypes } from './const';
declare function capitalizeFirstLetter(input: string): string;
declare function normalizeHexAddress(input: string): string | null;
declare function numberToAddressHex(num: number): string;
declare function normalizePackageId(input: string): string;
declare function convertHttpToWebSocket(url: string): string;
export { BasicBcsTypes, capitalizeFirstLetter, normalizeHexAddress, numberToAddressHex, normalizePackageId, convertHttpToWebSocket };
