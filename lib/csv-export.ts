export function exportToCSV(data: any[], filename: string = 'export.csv') {
  if (!data || data.length === 0) {
    console.warn('No data to export');
    return;
  }
  
  // Get all unique keys (columns) from the first object level only
  const allKeys = new Set<string>();
  data.forEach(item => {
    Object.keys(item).forEach(key => allKeys.add(key));
  });
  
  const headers = Array.from(allKeys);
  
  // Create CSV content
  const csvContent = [
    // Headers
    headers.map(h => `"${h}"`).join(','),
    // Data rows
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        let stringValue = '';
        
        if (value === null || value === undefined) {
          stringValue = '';
        } else if (value instanceof Date) {
          stringValue = value.toISOString();
        } else if (typeof value === 'object') {
          // Convert objects and arrays to JSON strings
          stringValue = JSON.stringify(value);
        } else {
          stringValue = String(value);
        }
        
        // Escape quotes and wrap in quotes if contains comma, newline, or quotes
        if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',')
    )
  ].join('\n');
  
  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up
  URL.revokeObjectURL(url);
}