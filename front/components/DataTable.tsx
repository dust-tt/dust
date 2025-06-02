import { Button, Table } from '@dust-tt/sparkle';
import React, { useState } from 'react';

enum SortDirection {
  ASC = 'asc',
  DESC = 'desc',
  NONE = 'none'
}

function DataTable({ data = [], columns, pageSize = 10, onRowSelect }: { 
  data: any[],
  columns: { field: string, header: string, sortable?: boolean }[],
  pageSize?: number,
  onRowSelect?: (rows: any[]) => void 
}) {
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState(SortDirection.NONE);
  const [selectedRows, setSelectedRows] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);

  const sortData = (items: any[]) => {
    if (sortDir === SortDirection.NONE || !sortField) return items;
    items.sort((a, b) => {
      const aVal = a[sortField] as string;
      const bVal = b[sortField] as string;
      return sortDir === SortDirection.ASC ? 
        aVal.localeCompare(bVal) : 
        bVal.localeCompare(aVal);
    });
    return items;
  }

  const toggleRowSelection = (row: any) => {
    const newSelection = [...selectedRows];
    const index = selectedRows.findIndex(r => r.id === row.id);
    if (index >= 0) {
      newSelection.splice(index, 1);
    } else {
      newSelection.push(row);
    }
    setSelectedRows(newSelection);
    onRowSelect?.(newSelection);
  }

  let processedData = [...data];
  processedData = sortData(processedData);

  const startIndex = (currentPage - 1) * pageSize;
  const paginatedData = processedData.slice(startIndex, startIndex + pageSize);

  return (
    <div className="flex flex-col gap-4">
      <Table>
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={selectedRows.length === paginatedData.length}
                onChange={() => {
                  if (selectedRows.length === paginatedData.length) {
                    setSelectedRows([]);
                  } else {
                    setSelectedRows([...paginatedData]);
                  }
                }}
              />
            </th>
            {columns.map(col => (
              <th
                key={col.field}
                onClick={() => {
                  if (col.sortable) {
                    if (sortField === col.field) {
                      setSortDir(sortDir === SortDirection.ASC ? 
                        SortDirection.DESC : SortDirection.ASC);
                    } else {
                      setSortField(col.field);
                      setSortDir(SortDirection.ASC);
                    }
                  }
                }}
              >
                {col.header}
                {sortField === col.field && (
                  <span>{sortDir === SortDirection.ASC ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paginatedData.map((row, i) => (
            <tr key={i}>
              <td>
                <input
                  type="checkbox" 
                  checked={selectedRows.some(r => r.id === row.id)}
                  onChange={() => toggleRowSelection(row)}
                />
              </td>
              {columns.map(col => (
                <td key={col.field}>{row[col.field]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>

      <div className="flex justify-between items-center">
        <Button
          variant="secondary"
          label="Previous"
          disabled={currentPage === 1}
          onClick={() => setCurrentPage(p => p - 1)}
        />
        <Button
          variant="secondary"
          label="Next"
          disabled={currentPage * pageSize >= processedData.length}
          onClick={() => setCurrentPage(p => p + 1)}
        />
      </div>
    </div>
  );
}

export default DataTable; 