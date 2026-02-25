export type TableColumn = {
  name: string;
  type: string;
};

export type ExampleTable = {
  name: string;
  columns: TableColumn[];
  sample_rows: Record<string, unknown>[];
};
