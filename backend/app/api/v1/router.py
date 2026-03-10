from fastapi import APIRouter

from app.api.v1.endpoints import (
    assignments,
    auth,
    contacts,
    lessons,
    materials,
    student_auth,
    student_me,
    students,
    subjects,
    theory_topics,
    tutor_students,
    tutors,
)

api_router = APIRouter()

# Репетитор
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(tutors.router, prefix="/tutors", tags=["tutors"])
api_router.include_router(students.router, prefix="/students", tags=["students"])
api_router.include_router(subjects.router, prefix="/subjects", tags=["subjects"])
api_router.include_router(tutor_students.router, prefix="/tutor-students", tags=["tutor-students"])
api_router.include_router(lessons.router, prefix="/lessons", tags=["lessons"])
api_router.include_router(assignments.router, prefix="/assignments", tags=["assignments"])
api_router.include_router(theory_topics.router, prefix="/theory-topics", tags=["theory-topics"])
api_router.include_router(materials.router, prefix="/materials", tags=["materials"])
api_router.include_router(contacts.router, prefix="/contacts", tags=["contacts"])

# Ученик
api_router.include_router(student_auth.router, prefix="/student/auth", tags=["student-auth"])
api_router.include_router(student_me.router, prefix="/student", tags=["student"])
