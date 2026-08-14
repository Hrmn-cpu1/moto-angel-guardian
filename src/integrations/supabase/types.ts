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
          resolved_at: string | null
          sos_event_id: string | null
          status: string
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
          resolved_at?: string | null
          sos_event_id?: string | null
          status?: string
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
          resolved_at?: string | null
          sos_event_id?: string | null
          status?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_alerts_sos_event_id_fkey"
            columns: ["sos_event_id"]
            isOneToOne: false
            referencedRelation: "sos_events"
            referencedColumns: ["id"]
          },
        ]
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
      location_shares: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          status: string
          updated_at: string
          viewer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          status?: string
          updated_at?: string
          viewer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          status?: string
          updated_at?: string
          viewer_id?: string
        }
        Relationships: []
      }
      native_auth_codes: {
        Row: {
          access_token: string
          code: string
          code_challenge: string
          created_at: string
          expires_at: string
          refresh_token: string
          used_at: string | null
        }
        Insert: {
          access_token: string
          code: string
          code_challenge: string
          created_at?: string
          expires_at?: string
          refresh_token: string
          used_at?: string | null
        }
        Update: {
          access_token?: string
          code?: string
          code_challenge?: string
          created_at?: string
          expires_at?: string
          refresh_token?: string
          used_at?: string | null
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
          accuracy_m: number | null
          address: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          fix_age_ms: number | null
          id: string
          latitude: number | null
          longitude: number | null
          note: string | null
          request_id: string | null
          resolved_at: string | null
          status: string
          triggered_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accuracy_m?: number | null
          address?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          fix_age_ms?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          note?: string | null
          request_id?: string | null
          resolved_at?: string | null
          status?: string
          triggered_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accuracy_m?: number | null
          address?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          fix_age_ms?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          note?: string | null
          request_id?: string | null
          resolved_at?: string | null
          status?: string
          triggered_at?: string
          updated_at?: string
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
          claim_token: string | null
          claimed_at: string | null
          created_at: string
          delivered_at: string | null
          emergency_contact_id: string | null
          error_message: string | null
          id: string
          last_status_at: string | null
          provider: string
          provider_message_id: string | null
          recipient_name: string
          recipient_phone: string
          request_id: string | null
          sent_at: string | null
          sos_event_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          claim_token?: string | null
          claimed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          emergency_contact_id?: string | null
          error_message?: string | null
          id?: string
          last_status_at?: string | null
          provider?: string
          provider_message_id?: string | null
          recipient_name?: string
          recipient_phone: string
          request_id?: string | null
          sent_at?: string | null
          sos_event_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          claim_token?: string | null
          claimed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          emergency_contact_id?: string | null
          error_message?: string | null
          id?: string
          last_status_at?: string | null
          provider?: string
          provider_message_id?: string | null
          recipient_name?: string
          recipient_phone?: string
          request_id?: string | null
          sent_at?: string | null
          sos_event_id?: string
          status?: string
          updated_at?: string
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
      claim_sos_notifications: {
        Args: {
          _claim_token: string
          _max?: number
          _only_failed?: boolean
          _sos_event_id: string
          _stale_after?: string
        }
        Returns: {
          attempts: number
          id: string
          recipient_name: string
          recipient_phone: string
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
      location_share_inbox: {
        Args: never
        Returns: {
          created_at: string
          id: string
          status: string
          viewer_avatar: string
          viewer_id: string
          viewer_name: string
        }[]
      }
      mark_sos_notification_delivered: {
        Args: {
          _occurred_at?: string
          _provider_message_id: string
          _status?: string
        }
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
      presence_touch: {
        Args: {
          _heading?: number
          _lat: number
          _lng: number
          _speed_kmh?: number
        }
        Returns: string
      }
      purge_native_auth_codes: { Args: never; Returns: undefined }
      purge_stale_presence: {
        Args: { _days?: number }
        Returns: {
          anonimizadas: number
          apagadas: number
        }[]
      }
      request_location_access: { Args: { _phone: string }; Returns: string }
      risk_heatmap: {
        Args: {
          _days?: number
          _lat: number
          _lng: number
          _radius_km?: number
        }
        Returns: {
          lat: number
          lng: number
          weight: number
        }[]
      }
      set_location_sharing: { Args: { _enabled: boolean }; Returns: boolean }
      settle_sos_notification: {
        Args: {
          _claim_token: string
          _error?: string
          _id: string
          _ok: boolean
          _provider_message_id?: string
        }
        Returns: boolean
      }
      sos_active_event: {
        Args: never
        Returns: {
          accuracy_m: number
          latitude: number
          longitude: number
          note: string
          queued: number
          request_id: string
          sos_event_id: string
          status: string
          triggered_at: string
        }[]
      }
      sos_cancel: {
        Args: { _reason?: string; _sos_event_id: string }
        Returns: {
          cancelled_at: string
          sos_event_id: string
          status: string
        }[]
      }
      sos_open: {
        Args: {
          _accuracy_m?: number
          _fix_age_ms?: number
          _lat: number
          _lng: number
          _note?: string
          _request_id: string
        }
        Returns: {
          queued: number
          request_id: string
          reused: boolean
          sos_event_id: string
          status: string
          triggered_at: string
        }[]
      }
      sos_purge_history: { Args: never; Returns: number }
      sos_resolve: {
        Args: { _sos_event_id: string }
        Returns: {
          resolved_at: string
          sos_event_id: string
          status: string
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
