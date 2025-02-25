"use client"

import { useState, useEffect } from "react"

interface Student {
  id: number
  name: string
  attendance: number
  notes: string
  professorIndex: number
}

interface StudentCardProps {
  student: Student
  onIncrement: () => void
  onDecrement: () => void
  onUpdateNotes: (notes: string) => void
  onRemove: () => void
}

export default function StudentCard({ student, onIncrement, onDecrement, onUpdateNotes, onRemove }: StudentCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [currentNotes, setCurrentNotes] = useState(student.notes)
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    setCurrentNotes(student.notes)
  }, [student.notes])

  const handleSave = () => {
    onUpdateNotes(currentNotes)
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    }
  }

  const toggleEdit = () => {
    if (isEditing) {
      handleSave()
    } else {
      setIsEditing(true)
    }
  }

  const handleIncrement = () => {
    setIsAnimating(true)
    onIncrement()
    setTimeout(() => setIsAnimating(false), 200)
  }

  const handleDecrement = () => {
    setIsAnimating(true)
    onDecrement()
    setTimeout(() => setIsAnimating(false), 200)
  }

  return (
    <div className="relative bg-card p-4 rounded-lg shadow-lg hover:bg-accent/5 transition-colors duration-200">
      <h3 className="text-lg font-semibold mb-2 cursor-pointer hover:text-primary" onClick={toggleEdit}>
        {student.name}
      </h3>
      <div className="flex items-center gap-4 mb-4">
        <button
          className="bg-destructive hover:bg-destructive/90 text-destructive-foreground w-8 h-8 rounded-full transition-transform active:scale-95"
          onClick={handleDecrement}
        >
          -
        </button>
        <span className={`w-8 text-center font-medium transition-transform ${isAnimating ? 'scale-125' : ''}`}>
          {student.attendance}
        </span>
        <button
          className="bg-primary hover:bg-primary/90 text-primary-foreground w-8 h-8 rounded-full transition-transform active:scale-95"
          onClick={handleIncrement}
        >
          +
        </button>
      </div>
      {isEditing && (
        <div className="mt-2">
          <textarea
            value={currentNotes}
            onChange={(e) => setCurrentNotes(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full p-2 rounded-md bg-background border border-input hover:border-primary focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
            rows={3}
            placeholder="Add notes about the student..."
          />
          <button
            onClick={handleSave}
            className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Save
          </button>
        </div>
      )}
      {!isEditing && student.notes && <div className="mt-2 text-sm text-muted-foreground">{student.notes}</div>}
      
      <button
        onClick={onRemove}
        className="absolute bottom-4 right-4 text-muted-foreground hover:text-destructive transition-colors p-2 rounded-full hover:bg-destructive/10"
        title="Remove student"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        </svg>
      </button>
    </div>
  )
} 