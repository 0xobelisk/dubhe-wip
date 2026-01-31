import { JsonValue } from '@protobuf-ts/runtime';
import { Struct } from '../index';

export function structToJson(struct: Struct | undefined): JsonValue {
  if (!struct) return null;
  return Struct.toJson(struct);
}
