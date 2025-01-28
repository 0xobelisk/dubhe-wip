export const parseValue = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    const parsed = JSON.parse(value);

    if (typeof parsed === 'object' && parsed !== null) {
      if ('variant' in parsed) {
        return parsed.variant;
      }

      if ('fields' in parsed) {
        return parsed.fields;
      }
    }

    return parsed;
  } catch (error) {
    return value;
  }
};
