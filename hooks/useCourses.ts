"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/lib/api";
import type { Course } from "@/types";

export const useCourses = () => {
  const { getToken } = useAuth();
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [userCourses, setUserCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all courses and user's courses on mount
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const token = await getToken();
        if (!token) {
          setError("Not authenticated");
          return;
        }

        const [all, user] = await Promise.all([
          api.courses.listAll(token),
          api.courses.listUserCourses(token),
        ]);

        setAllCourses(all);
        setUserCourses(user);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch courses");
      } finally {
        setIsLoading(false);
      }
    };

    fetchCourses();
  }, [getToken]);

  // Add a course to user's list
  const addCourse = useCallback(
    async (course: Course) => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Not authenticated");

        await api.courses.addToUser(token, course.id);
        setUserCourses((prev) => {
          // Avoid duplicates
          if (prev.some((c) => c.id === course.id)) return prev;
          return [...prev, course];
        });
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add course");
        return false;
      }
    },
    [getToken]
  );

  // Remove a course from user's list
  const removeCourse = useCallback(
    async (courseId: string) => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Not authenticated");

        await api.courses.removeFromUser(token, courseId);
        setUserCourses((prev) => prev.filter((c) => c.id !== courseId));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove course");
        return false;
      }
    },
    [getToken]
  );

  // Get courses that user hasn't added yet
  const availableCourses = useMemo(
    () => allCourses.filter(
      (course) => !userCourses.some((uc) => uc.id === course.id)
    ),
    [allCourses, userCourses]
  );

  return {
    allCourses,
    userCourses,
    availableCourses,
    isLoading,
    error,
    addCourse,
    removeCourse,
  };
};
