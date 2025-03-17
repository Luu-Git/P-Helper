import { formatNameLastFirst } from '@/lib/utils';

interface Student {
  id: number
  name: string
  attendance: number
  notes: string
}

interface StudentDetailsProps {
  student: Student
}

export default function StudentDetails({ student }: StudentDetailsProps) {
  return (
    <div className="absolute z-10 bg-white border border-gray-200 p-4 rounded shadow-lg mt-2 w-64">
      <h4 className="font-semibold mb-2">{formatNameLastFirst(student.name)}</h4>
      <p className="text-sm mb-2">Attendance: {student.attendance}</p>
      <p className="text-sm">{student.notes || "No notes available."}</p>
    </div>
  )
} 