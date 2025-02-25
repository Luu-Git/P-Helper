"use client"

import { useState, useEffect, useRef } from "react"
import StudentCard from "./StudentCard"

interface Student {
  id: number
  name: string
  attendance: number
  notes: string
  professorIndex: number
}

interface StudentGroupProps {
  professorName: string
  students: Student[]
  onStudentsChange: (students: Student[]) => void
}

export default function StudentGroup({ professorName, students, onStudentsChange }: StudentGroupProps) {
  const [isAddingStudent, setIsAddingStudent] = useState(false)
  const [newStudentName, setNewStudentName] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isAddingStudent && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isAddingStudent])

  const handleAddStudent = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (newStudentName.trim()) {
      onStudentsChange([
        ...students,
        {
          id: Date.now(),
          name: newStudentName.trim(),
          attendance: 0,
          notes: "",
          professorIndex: students[0]?.professorIndex ?? 0,
        },
      ])
      setNewStudentName("")
      setIsAddingStudent(false)
    }
  }

  const removeAllStudents = () => {
    if (window.confirm("Are you sure you want to remove all students?")) {
      onStudentsChange([])
    }
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold">{professorName}&apos;s Group</h2>
        </div>
        <div className="flex gap-2">
          <button
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
            onClick={() => setIsAddingStudent(true)}
          >
            Add Student
          </button>
          <button
            className="bg-destructive text-destructive-foreground px-4 py-2 rounded-md hover:bg-destructive/90 transition-colors"
            onClick={removeAllStudents}
          >
            Remove All Students
          </button>
        </div>
      </div>
      {isAddingStudent && (
        <form onSubmit={handleAddStudent} className="mb-6 flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={newStudentName}
            onChange={(e) => setNewStudentName(e.target.value)}
            placeholder="Enter student name"
            className="flex-grow p-2 rounded-md bg-background border border-input hover:border-primary focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
          />
          <button
            type="submit"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
          >
            Confirm
          </button>
          <button
            type="button"
            className="bg-secondary text-secondary-foreground px-4 py-2 rounded-md hover:bg-secondary/80 transition-colors"
            onClick={() => setIsAddingStudent(false)}
          >
            Cancel
          </button>
        </form>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {students.map((student) => (
          <StudentCard
            key={student.id}
            student={student}
            onIncrement={() => {
              onStudentsChange(
                students.map((s) => (s.id === student.id ? { ...s, attendance: s.attendance + 1 } : s))
              )
            }}
            onDecrement={() => {
              onStudentsChange(
                students.map((s) => (s.id === student.id ? { ...s, attendance: s.attendance - 1 } : s))
              )
            }}
            onUpdateNotes={(notes: string) => {
              onStudentsChange(students.map((s) => (s.id === student.id ? { ...s, notes } : s)))
            }}
            onRemove={() => {
              onStudentsChange(students.filter((s) => s.id !== student.id))
            }}
          />
        ))}
      </div>
    </div>
  )
} 