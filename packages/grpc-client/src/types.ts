// DubheMetadata type definition for JSON format dubhe configuration
export type DubheMetadata = {
  components: Array<
    Record<
      string,
      {
        fields: Array<Record<string, any>>;
        keys: string[];
        offchain?: boolean;
      }
    >
  >;
  resources: Array<
    Record<
      string,
      {
        fields: Array<Record<string, any>>;
        keys: string[];
        offchain?: boolean;
      }
    >
  >;
  enums: any[];
};
