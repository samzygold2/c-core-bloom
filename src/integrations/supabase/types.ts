export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          admin_id: string
          id: string
          timestamp: string | null
        }
        Insert: {
          action: string
          admin_id: string
          id?: string
          timestamp?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          id?: string
          timestamp?: string | null
        }
        Relationships: []
      }
      jamb_integrity_audit_log: {
        Row: {
          actions_taken: Json | null
          anomalies: Json
          duration_ms: number | null
          health_score: number
          id: string
          run_at: string
          run_by: string | null
          trigger_source: string
        }
        Insert: {
          actions_taken?: Json | null
          anomalies: Json
          duration_ms?: number | null
          health_score: number
          id?: string
          run_at?: string
          run_by?: string | null
          trigger_source?: string
        }
        Update: {
          actions_taken?: Json | null
          anomalies?: Json
          duration_ms?: number | null
          health_score?: number
          id?: string
          run_at?: string
          run_by?: string | null
          trigger_source?: string
        }
        Relationships: []
      }
      jamb_sync_jobs: {
        Row: {
          consecutive_failures: number
          created_at: string
          current_page: number
          current_subject: string | null
          current_year: number | null
          errors: string[]
          failed: number
          finished_at: string | null
          id: string
          inserted: number
          message: string | null
          pages: number
          started_at: string
          started_by: string | null
          status: string
          subjects: string[]
          task_retry_counts: Json
          total_per_call: number
          updated_at: string
          years: number[]
        }
        Insert: {
          consecutive_failures?: number
          created_at?: string
          current_page?: number
          current_subject?: string | null
          current_year?: number | null
          errors?: string[]
          failed?: number
          finished_at?: string | null
          id?: string
          inserted?: number
          message?: string | null
          pages?: number
          started_at?: string
          started_by?: string | null
          status?: string
          subjects: string[]
          task_retry_counts?: Json
          total_per_call?: number
          updated_at?: string
          years: number[]
        }
        Update: {
          consecutive_failures?: number
          created_at?: string
          current_page?: number
          current_subject?: string | null
          current_year?: number | null
          errors?: string[]
          failed?: number
          finished_at?: string | null
          id?: string
          inserted?: number
          message?: string | null
          pages?: number
          started_at?: string
          started_by?: string | null
          status?: string
          subjects?: string[]
          task_retry_counts?: Json
          total_per_call?: number
          updated_at?: string
          years?: number[]
        }
        Relationships: []
      }
      password_reset_otps: {
        Row: {
          created_at: string
          expires_at: string
          generated_by: string
          id: string
          otp_hash: string
          used: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          generated_by: string
          id?: string
          otp_hash: string
          used?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          generated_by?: string
          id?: string
          otp_hash?: string
          used?: boolean
          user_id?: string
        }
        Relationships: []
      }
      password_reset_requests: {
        Row: {
          created_at: string
          id: string
          processed_at: string | null
          processed_by: string | null
          role: string
          status: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          role: string
          status?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          role?: string
          status?: string
          username?: string
        }
        Relationships: []
      }
      past_questions: {
        Row: {
          aloc_id: string
          content_hash: string | null
          correct_answer: string | null
          created_at: string
          exam_type: string | null
          explanation: string | null
          id: string
          image_url: string | null
          is_quarantined: boolean
          needs_review: boolean
          option_a: string | null
          option_b: string | null
          option_c: string | null
          option_d: string | null
          quarantine_reason: string | null
          question_text: string
          subject: string
          updated_at: string
          year: number
        }
        Insert: {
          aloc_id: string
          content_hash?: string | null
          correct_answer?: string | null
          created_at?: string
          exam_type?: string | null
          explanation?: string | null
          id?: string
          image_url?: string | null
          is_quarantined?: boolean
          needs_review?: boolean
          option_a?: string | null
          option_b?: string | null
          option_c?: string | null
          option_d?: string | null
          quarantine_reason?: string | null
          question_text: string
          subject: string
          updated_at?: string
          year: number
        }
        Update: {
          aloc_id?: string
          content_hash?: string | null
          correct_answer?: string | null
          created_at?: string
          exam_type?: string | null
          explanation?: string | null
          id?: string
          image_url?: string | null
          is_quarantined?: boolean
          needs_review?: boolean
          option_a?: string | null
          option_b?: string | null
          option_c?: string | null
          option_d?: string | null
          quarantine_reason?: string | null
          question_text?: string
          subject?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          assigned_admin_id: string | null
          avatar_url: string | null
          created_at: string | null
          description: string | null
          email: string
          firstname: string
          id: string
          is_active: boolean
          is_pending: boolean | null
          is_waiting: boolean | null
          lastname: string
          username: string | null
        }
        Insert: {
          assigned_admin_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          description?: string | null
          email: string
          firstname?: string
          id: string
          is_active?: boolean
          is_pending?: boolean | null
          is_waiting?: boolean | null
          lastname?: string
          username?: string | null
        }
        Update: {
          assigned_admin_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          description?: string | null
          email?: string
          firstname?: string
          id?: string
          is_active?: boolean
          is_pending?: boolean | null
          is_waiting?: boolean | null
          lastname?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_assigned_admin_id_fkey"
            columns: ["assigned_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_assigned_admin_id_fkey"
            columns: ["assigned_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      question_visibility: {
        Row: {
          activated_at: string | null
          admin_id: string
          created_at: string
          id: string
          is_active: boolean
          question_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activated_at?: string | null
          admin_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          question_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activated_at?: string | null
          admin_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          question_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_visibility_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "past_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_visibility_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "past_questions_clean"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          correct_answer: number
          created_at: string | null
          created_by: string | null
          difficulty: string | null
          id: string
          is_reviewed: boolean | null
          options: Json
          question_text: string
          reviewed_at: string | null
          reviewed_by: string | null
          test_id: string
        }
        Insert: {
          correct_answer: number
          created_at?: string | null
          created_by?: string | null
          difficulty?: string | null
          id?: string
          is_reviewed?: boolean | null
          options: Json
          question_text: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          test_id: string
        }
        Update: {
          correct_answer?: number
          created_at?: string | null
          created_by?: string | null
          difficulty?: string | null
          id?: string
          is_reviewed?: boolean | null
          options?: Json
          question_text?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          created_at: string | null
          id: string
          log_level: string
          message: string
          metadata: Json | null
          source: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          log_level: string
          message: string
          metadata?: Json | null
          source?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          log_level?: string
          message?: string
          metadata?: Json | null
          source?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      tests: {
        Row: {
          created_at: string | null
          created_by: string | null
          duration_minutes: number
          id: string
          is_active: boolean | null
          title: string
          total_questions: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          duration_minutes: number
          id?: string
          is_active?: boolean | null
          title: string
          total_questions?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean | null
          title?: string
          total_questions?: number | null
        }
        Relationships: []
      }
      user_admins: {
        Row: {
          admin_id: string
          approved_at: string | null
          created_at: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          admin_id: string
          approved_at?: string | null
          created_at?: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          admin_id?: string
          approved_at?: string | null
          created_at?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_tests: {
        Row: {
          answers: Json | null
          created_at: string | null
          end_time: string | null
          id: string
          score: number | null
          start_time: string | null
          test_id: string
          user_id: string
        }
        Insert: {
          answers?: Json | null
          created_at?: string | null
          end_time?: string | null
          id?: string
          score?: number | null
          start_time?: string | null
          test_id: string
          user_id: string
        }
        Update: {
          answers?: Json | null
          created_at?: string | null
          end_time?: string | null
          id?: string
          score?: number | null
          start_time?: string | null
          test_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_tests_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_profiles_public: {
        Row: {
          firstname: string | null
          id: string | null
          lastname: string | null
        }
        Relationships: []
      }
      past_questions_clean: {
        Row: {
          aloc_id: string | null
          content_hash: string | null
          correct_answer: string | null
          created_at: string | null
          exam_type: string | null
          explanation: string | null
          id: string | null
          image_url: string | null
          is_quarantined: boolean | null
          needs_review: boolean | null
          option_a: string | null
          option_b: string | null
          option_c: string | null
          option_d: string | null
          quarantine_reason: string | null
          question_text: string | null
          subject: string | null
          updated_at: string | null
          year: number | null
        }
        Insert: {
          aloc_id?: string | null
          content_hash?: string | null
          correct_answer?: string | null
          created_at?: string | null
          exam_type?: string | null
          explanation?: string | null
          id?: string | null
          image_url?: string | null
          is_quarantined?: boolean | null
          needs_review?: boolean | null
          option_a?: string | null
          option_b?: string | null
          option_c?: string | null
          option_d?: string | null
          quarantine_reason?: string | null
          question_text?: string | null
          subject?: string | null
          updated_at?: string | null
          year?: number | null
        }
        Update: {
          aloc_id?: string | null
          content_hash?: string | null
          correct_answer?: string | null
          created_at?: string | null
          exam_type?: string | null
          explanation?: string | null
          id?: string | null
          image_url?: string | null
          is_quarantined?: boolean | null
          needs_review?: boolean | null
          option_a?: string | null
          option_b?: string | null
          option_c?: string | null
          option_d?: string | null
          quarantine_reason?: string | null
          question_text?: string | null
          subject?: string | null
          updated_at?: string | null
          year?: number | null
        }
        Relationships: []
      }
      user_questions: {
        Row: {
          created_at: string | null
          difficulty: string | null
          id: string | null
          options: Json | null
          question_text: string | null
          test_id: string | null
        }
        Insert: {
          created_at?: string | null
          difficulty?: string | null
          id?: string | null
          options?: Json | null
          question_text?: string | null
          test_id?: string | null
        }
        Update: {
          created_at?: string | null
          difficulty?: string | null
          id?: string | null
          options?: Json | null
          question_text?: string | null
          test_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      approve_all_jamb_questions: {
        Args: {
          specific_subject?: string
          specific_year?: number
          target_admin_id?: string
        }
        Returns: Json
      }
      audit_jamb_integrity: { Args: never; Returns: Json }
      cleanup_expired_otps: { Args: never; Returns: undefined }
      get_database_storage_stats: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      jamb_resolve_integrity_issues: { Args: never; Returns: Json }
      jamb_run_integrity_audit: { Args: never; Returns: Json }
      score_test: {
        Args: { p_test_session_id: string; p_user_answers: Json }
        Returns: Json
      }
      validate_otp: {
        Args: { p_otp: string; p_username: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "user" | "super_admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "super_admin"],
    },
  },
} as const
