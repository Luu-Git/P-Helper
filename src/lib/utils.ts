// Utility function to format a name from "First Last" to "Last, First"
export const formatNameLastFirst = (fullName: string): string => {
  const parts = fullName.split(' ');
  if (parts.length < 2) return fullName; // Handle single-word names
  
  const lastName = parts.pop() || '';
  const firstName = parts.join(' ');
  return `${lastName}, ${firstName}`;
}; 