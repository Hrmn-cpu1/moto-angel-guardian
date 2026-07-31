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
      community_alerts: {
        Row: {
          address: string | null
          created_at: string
          description: string | null
          id: string
          lat: number
          lng: number
          title: string
          type: string
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          description?: string | null
          id?: string
          lat: number
          lng: number
          title: string
          type: string
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          description?: string | null
          id?: string
          lat?: number
          lng?: number
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      community_comments: {
        Row: {
          author_name: string
          created_at: string
          id: string
          post_id: string
          text: string
          user_id: string
        }
        Insert: {
          author_name?: string
          created_at?: string
          id?: string
          post_id: string
          text: string
          user_id: string
        }
        Update: {
          author_name?: string
          created_at?: string
          id?: string
          post_id?: string
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          author_name: string
          category: string
          created_at: string
          id: string
          region: string
          text: string
          user_id: string
        }
        Insert: {
          author_name?: string
          category?: string
          created_at?: string
          id?: string
          region?: string
          text: string
          user_id: string
        }
        Update: {
          author_name?: string
          category?: string
          created_at?: string
          id?: string
          region?: string
          text?: string
          user_id?: string
        }
        Relationships: []
      }
      emergency_contacts: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          name: string
          phone: string
          relation: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          name: string
          phone: string
          relation?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          name?: string
          phone?: string
          relation?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      live_locations: {
        Row: {
          heading: number | null
          lat: number
          lng: number
          sharing: boolean
          speed_kmh: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          heading?: number | null
          lat: number
          lng: number
          sharing?: boolean
          speed_kmh?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          heading?: number | null
          lat?: number
          lng?: number
          sharing?: boolean
          speed_kmh?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      partners: {
        Row: {
          active: boolean
          address: string | null
          benefit: string
          category: string
          created_at: string
          detail: string | null
          featured: boolean
          id: string
          lat: number | null
          lng: number | null
          logo_url: string | null
          name: string
          phone: string | null
          sort_order: number
        }
        Insert: {
          active?: boolean
          address?: string | null
          benefit: string
          category: string
          created_at?: string
          detail?: string | null
          featured?: boolean
          id?: string
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          name: string
          phone?: string | null
          sort_order?: number
        }
        Update: {
          active?: boolean
          address?: string | null
          benefit?: string
          category?: string
          created_at?: string
          detail?: string | null
          featured?: boolean
          id?: string
          lat?: number | null
          lng?: number | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bike_model: string
          blood_type: string
          created_at: string
          email: string
          emergency_contact: string
          emergency_phone: string
          id: string
          name: string
          phone: string
          plate: string
          terms_accepted_at: string | null
          terms_version: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bike_model?: string
          blood_type?: string
          created_at?: string
          email?: string
          emergency_contact?: string
          emergency_phone?: string
          id: string
          name?: string
          phone?: string
          plate?: string
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bike_model?: string
          blood_type?: string
          created_at?: string
          email?: string
          emergency_contact?: string
          emergency_phone?: string
          id?: string
          name?: string
          phone?: string
          plate?: string
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sos_events: {
        Row: {
          address: string | null
          id: string
          latitude: number | null
          longitude: number | null
          note: string | null
          status: string
          triggered_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          note?: string | null
          status?: string
          triggered_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          note?: string | null
          status?: string
          triggered_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trips: {
        Row: {
          avg_speed: number
          companion: string | null
          created_at: string
          distance_km: number
          duration_seconds: number
          ended_at: string
          id: string
          started_at: string
          user_id: string
        }
        Insert: {
          avg_speed?: number
          companion?: string | null
          created_at?: string
          distance_km?: number
          duration_seconds?: number
          ended_at: string
          id?: string
          started_at: string
          user_id: string
        }
        Update: {
          avg_speed?: number
          companion?: string | null
          created_at?: string
          distance_km?: number
          duration_seconds?: number
          ended_at?: string
          id?: string
          started_at?: string
          user_id?: string
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
      whatsapp_notifications: {
        Row: {
          attempts: number
          created_at: string
          emergency_contact_id: string | null
          error_message: string | null
          id: string
          provider: string
          provider_message_id: string | null
          recipient_name: string
          recipient_phone: string
          sent_at: string | null
          sos_event_id: string
          status: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          emergency_contact_id?: string | null
          error_message?: string | null
          id?: string
          provider?: string
          provider_message_id?: string | null
          recipient_name?: string
          recipient_phone: string
          sent_at?: string | null
          sos_event_id: string
          status?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          emergency_contact_id?: string | null
          error_message?: string | null
          id?: string
          provider?: string
          provider_message_id?: string | null
          recipient_name?: string
          recipient_phone?: string
          sent_at?: string | null
          sos_event_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_notifications_emergency_contact_id_fkey"
            columns: ["emergency_contact_id"]
            isOneToOne: false
            referencedRelation: "emergency_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_notifications_sos_event_id_fkey"
            columns: ["sos_event_id"]
            isOneToOne: false
            referencedRelation: "sos_events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_activity: {
        Args: { _days?: number }
        Returns: {
          day: string
          new_users: number
          posts: number
          sos: number
          trips: number
        }[]
      }
      admin_stats: {
        Args: never
        Returns: {
          confirmed_users: number
          new_last_30d: number
          new_last_7d: number
          total_users: number
        }[]
      }
      community_feed: {
        Args: { _limit?: number }
        Returns: {
          author_name: string
          category: string
          comments_count: number
          created_at: string
          id: string
          liked: boolean
          likes_count: number
          region: string
          text: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_trusted_contact: {
        Args: { _owner: string; _viewer: string }
        Returns: boolean
      }
      nearby_alerts: {
        Args: {
          _hours?: number
          _lat: number
          _lng: number
          _radius_km?: number
        }
        Returns: {
          address: string
          author_name: string
          created_at: string
          description: string
          distance_km: number
          id: string
          is_mine: boolean
          lat: number
          lng: number
          title: string
          type: string
        }[]
      }
      normalize_phone: { Args: { _phone: string }; Returns: string }
      online_riders: {
        Args: {
          _lat: number
          _lng: number
          _minutes?: number
          _radius_km?: number
        }
        Returns: {
          avatar_url: string
          distance_km: number
          heading: number
          lat: number
          lng: number
          name: string
          speed_kmh: number
          updated_at: string
          user_id: string
        }[]
      }
      user_history: {
        Args: { _limit?: number }
        Returns: {
          description: string
          id: string
          kind: string
          meta: Json
          title: string
          ts: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
    },
  },
} as const
