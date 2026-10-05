import React from 'react';

export interface ColumnDef<T> {
  key: string;
  header: string;
  render?: (item: T, index: number) => React.ReactNode;
  mono?: boolean;
  width?: string | number;
  align?: 'left' | 'center' | 'right';
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string | number;
  onRowClick?: (item: T) => void;
  maxHeight?: string | number;
  emptyMessage?: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  maxHeight,
  emptyMessage = 'No records available.',
  className = '',
}: DataTableProps<T>) {
  return (
    <div
      className={`ui-data-table-wrapper ${className}`}
      style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
    >
      <table className="ui-data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="ui-data-th"
                style={{
                  width: col.width,
                  textAlign: col.align || 'left',
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="ui-data-empty">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item, rowIdx) => (
              <tr
                key={keyExtractor(item, rowIdx)}
                className="ui-data-tr"
                onClick={onRowClick ? () => onRowClick(item) : undefined}
                style={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                {columns.map((col) => {
                  const content = col.render
                    ? col.render(item, rowIdx)
                    : (item as Record<string, unknown>)[col.key] != null
                    ? String((item as Record<string, unknown>)[col.key])
                    : '—';

                  return (
                    <td
                      key={col.key}
                      className={`ui-data-td ${col.mono ? 'mono' : ''}`}
                      style={{ textAlign: col.align || 'left' }}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
