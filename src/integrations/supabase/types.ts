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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      certificates: {
        Row: {
          certificate_id: string
          certificate_code: string | null
          course_id: string | null
          created_at: string
          email_attempts: number
          email_last_error: string | null
          email_sent_at: string | null
          email_status: string
          expiry_date: string | null
          id: string
          issue_date: string
          issued_by: string | null
          issuer_name: string
          programme: string
          recipient_email: string | null
          recipient_name: string
          revoke_reason: string | null
          revoked_at: string | null
          status: Database["public"]["Enums"]["certificate_status"]
          student_id: string | null
          updated_at: string
        }
        Insert: {
          certificate_id: string
          certificate_code?: string | null
          course_id?: string | null
          created_at?: string
          email_attempts?: number
          email_last_error?: string | null
          email_sent_at?: string | null
          email_status?: string
          expiry_date?: string | null
          id?: string
          issue_date: string
          issued_by?: string | null
          issuer_name: string
          programme: string
          recipient_email?: string | null
          recipient_name: string
          revoke_reason?: string | null
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["certificate_status"]
          student_id?: string | null
          updated_at?: string
        }
        Update: {
          certificate_id?: string
          certificate_code?: string | null
          course_id?: string | null
          created_at?: string
          email_attempts?: number
          email_last_error?: string | null
          email_sent_at?: string | null
          email_status?: string
          expiry_date?: string | null
          id?: string
          issue_date?: string
          issued_by?: string | null
          issuer_name?: string
          programme?: string
          recipient_email?: string | null
          recipient_name?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["certificate_status"]
          student_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          active: boolean
          category: string
          code: string
          created_at: string
          description: string | null
          duration_text: string | null
          fee_non_unza: number | null
          fee_unza: number | null
          id: string
          mode: string | null
          name: string
          prefix: string
          start_date: string | null
          time_slot: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          code: string
          created_at?: string
          description?: string | null
          duration_text?: string | null
          fee_non_unza?: number | null
          fee_unza?: number | null
          id?: string
          mode?: string | null
          name: string
          prefix: string
          start_date?: string | null
          time_slot?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          code?: string
          created_at?: string
          description?: string | null
          duration_text?: string | null
          fee_non_unza?: number | null
          fee_unza?: number | null
          id?: string
          mode?: string | null
          name?: string
          prefix?: string
          start_date?: string | null
          time_slot?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      enrolments: {
        Row: {
          certificate_id: string | null
          completed_at: string | null
          course_id: string
          created_at: string
          enrolled_at: string
          fee_charged: number | null
          id: string
          notes: string | null
          payment_status: string
          started_at: string | null
          status: Database["public"]["Enums"]["enrolment_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          certificate_id?: string | null
          completed_at?: string | null
          course_id: string
          created_at?: string
          enrolled_at?: string
          fee_charged?: number | null
          id?: string
          notes?: string | null
          payment_status?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["enrolment_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          certificate_id?: string | null
          completed_at?: string | null
          course_id?: string
          created_at?: string
          enrolled_at?: string
          fee_charged?: number | null
          id?: string
          notes?: string | null
          payment_status?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["enrolment_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrolments_certificate_fk"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      org_settings: {
        Row: {
          created_at: string
          id: boolean
          org_name: string
          org_prefix: string
          signatory1_name: string
          signatory1_title: string
          signatory2_name: string
          signatory2_title: string
          template_layout: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: boolean
          org_name?: string
          org_prefix?: string
          signatory1_name?: string
          signatory1_title?: string
          signatory2_name?: string
          signatory2_title?: string
          template_layout?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: boolean
          org_name?: string
          org_prefix?: string
          signatory1_name?: string
          signatory1_title?: string
          signatory2_name?: string
          signatory2_title?: string
          template_layout?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      student_access_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          detail: string | null
          id: string
          student_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          student_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_access_log_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          category: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          national_id: string | null
          metadata: Json | null
          notes: string | null
          phone: string | null
          pii_consent_at: string | null
          pii_consent_source: string | null
          unza_student_id: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          national_id?: string | null
          metadata?: Json | null
          notes?: string | null
          phone?: string | null
          pii_consent_at?: string | null
          pii_consent_source?: string | null
          unza_student_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          national_id?: string | null
          metadata?: Json | null
          notes?: string | null
          phone?: string | null
          pii_consent_at?: string | null
          pii_consent_source?: string | null
          unza_student_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      certificate_status: "valid" | "revoked"
      enrolment_status: "enrolled" | "in_progress" | "completed" | "certified"
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
      app_role: ["admin", "user"],
      certificate_status: ["valid", "revoked"],
      enrolment_status: ["enrolled", "in_progress", "completed", "certified"],
    },
  },
} as const
