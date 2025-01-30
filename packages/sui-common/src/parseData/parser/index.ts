export const parseData = (data: unknown) => {
    if (typeof data !== 'object' || data === null) {
        return data;
    }
    const parsedData: any = {};
    for (const key in data) {
        if (data.hasOwnProperty(key)) {
            // @ts-ignore
            const value = data[key];
            // console.log("===========", value)
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                if (value.hasOwnProperty('variant')) {
                    parsedData[key] = value.variant;
                } else if (value.hasOwnProperty('fields')) {
                    parsedData[key] = parseData(value.fields);
                } else {
                    parsedData[key] = parseData(value);
                }
            } else {
                parsedData[key] = value;
            }
        }
    }
    return parsedData;
}