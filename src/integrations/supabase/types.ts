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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      assignments: {
        Row: {
          accepted_at: string | null
          assigned_at: string
          created_at: string
          cycle_id: string | null
          first_action_at: string | null
          id: string
          lead_id: string
          owner_id: string
          previous_owner: string | null
          priority: Database["public"]["Enums"]["lead_priority"]
          reassign_reason: string | null
          reassigned_at: string | null
          sla_deadline_accept: string
          sla_deadline_first_action: string
          state: Database["public"]["Enums"]["assignment_state"]
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          assigned_at?: string
          created_at?: string
          cycle_id?: string | null
          first_action_at?: string | null
          id?: string
          lead_id: string
          owner_id: string
          previous_owner?: string | null
          priority: Database["public"]["Enums"]["lead_priority"]
          reassign_reason?: string | null
          reassigned_at?: string | null
          sla_deadline_accept: string
          sla_deadline_first_action: string
          state?: Database["public"]["Enums"]["assignment_state"]
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          assigned_at?: string
          created_at?: string
          cycle_id?: string | null
          first_action_at?: string | null
          id?: string
          lead_id?: string
          owner_id?: string
          previous_owner?: string | null
          priority?: Database["public"]["Enums"]["lead_priority"]
          reassign_reason?: string | null
          reassigned_at?: string | null
          sla_deadline_accept?: string
          sla_deadline_first_action?: string
          state?: Database["public"]["Enums"]["assignment_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "lead_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor: string | null
          at: string
          entity: string
          entity_id: string | null
          id: string
          next: Json | null
          prev: Json | null
          reason: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          at?: string
          entity: string
          entity_id?: string | null
          id?: string
          next?: Json | null
          prev?: Json | null
          reason?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          next?: Json | null
          prev?: Json | null
          reason?: string | null
        }
        Relationships: []
      }
      crib_bookings: {
        Row: {
          agreement_duration: number
          agreement_start_date: string
          country_code: string
          created_at: string
          created_by: string | null
          due_type: string
          due_value: string
          id: string
          lock_in_period: number
          maintenance_amount: number
          monthly_rent: number
          notes: string | null
          notice_period: number
          property_id: string
          property_name: string | null
          rent_cycle: string
          room_type_id: string
          security_deposit: number
          status: string
          tenant_name: string
          tenant_phone: string
          token: string
          updated_at: string
        }
        Insert: {
          agreement_duration?: number
          agreement_start_date: string
          country_code?: string
          created_at?: string
          created_by?: string | null
          due_type?: string
          due_value?: string
          id?: string
          lock_in_period?: number
          maintenance_amount?: number
          monthly_rent?: number
          notes?: string | null
          notice_period?: number
          property_id: string
          property_name?: string | null
          rent_cycle?: string
          room_type_id: string
          security_deposit?: number
          status?: string
          tenant_name: string
          tenant_phone: string
          token?: string
          updated_at?: string
        }
        Update: {
          agreement_duration?: number
          agreement_start_date?: string
          country_code?: string
          created_at?: string
          created_by?: string | null
          due_type?: string
          due_value?: string
          id?: string
          lock_in_period?: number
          maintenance_amount?: number
          monthly_rent?: number
          notes?: string | null
          notice_period?: number
          property_id?: string
          property_name?: string | null
          rent_cycle?: string
          room_type_id?: string
          security_deposit?: number
          status?: string
          tenant_name?: string
          tenant_phone?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_quality_reports: {
        Row: {
          created_at: string
          day: string
          generated_by: string | null
          id: string
          metrics: Json
          notes: string | null
        }
        Insert: {
          created_at?: string
          day: string
          generated_by?: string | null
          id?: string
          metrics?: Json
          notes?: string | null
        }
        Update: {
          created_at?: string
          day?: string
          generated_by?: string | null
          id?: string
          metrics?: Json
          notes?: string | null
        }
        Relationships: []
      }
      duplicate_matches: {
        Row: {
          created_at: string
          existing_lead_id: string | null
          id: string
          new_conversation_id: string | null
          phone: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          created_at?: string
          existing_lead_id?: string | null
          id?: string
          new_conversation_id?: string | null
          phone: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          created_at?: string
          existing_lead_id?: string | null
          id?: string
          new_conversation_id?: string | null
          phone?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "duplicate_matches_existing_lead_id_fkey"
            columns: ["existing_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_matches_new_conversation_id_fkey"
            columns: ["new_conversation_id"]
            isOneToOne: false
            referencedRelation: "inbound_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      eod_reports: {
        Row: {
          checklist: Json
          closed: boolean
          closed_at: string | null
          closed_by: string | null
          created_at: string
          day: string
          id: string
          totals: Json
        }
        Insert: {
          checklist?: Json
          closed?: boolean
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          day: string
          id?: string
          totals?: Json
        }
        Update: {
          checklist?: Json
          closed?: boolean
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          day?: string
          id?: string
          totals?: Json
        }
        Relationships: []
      }
      hourly_reports: {
        Row: {
          accepted: number
          assigned: number
          captured: number
          created_at: string
          duplicates: number
          first_actioned: number
          hour_start: string
          id: string
          owners_at_capacity: number
          pending_capture: number
          reassignments: number
          received: number
          sla_breaches: number
          super_hot_pending: number
          unclear_date: number
          unclear_location: number
        }
        Insert: {
          accepted?: number
          assigned?: number
          captured?: number
          created_at?: string
          duplicates?: number
          first_actioned?: number
          hour_start: string
          id?: string
          owners_at_capacity?: number
          pending_capture?: number
          reassignments?: number
          received?: number
          sla_breaches?: number
          super_hot_pending?: number
          unclear_date?: number
          unclear_location?: number
        }
        Update: {
          accepted?: number
          assigned?: number
          captured?: number
          created_at?: string
          duplicates?: number
          first_actioned?: number
          hour_start?: string
          id?: string
          owners_at_capacity?: number
          pending_capture?: number
          reassignments?: number
          received?: number
          sla_breaches?: number
          super_hot_pending?: number
          unclear_date?: number
          unclear_location?: number
        }
        Relationships: []
      }
      inbound_conversations: {
        Row: {
          captured_at: string | null
          captured_by: string | null
          conversation_link: string | null
          created_at: string
          cycle_id: string | null
          first_message: string | null
          id: string
          latest_message: string | null
          lead_id: string | null
          phone: string
          received_at: string
          source_id: string | null
          wa_name: string | null
        }
        Insert: {
          captured_at?: string | null
          captured_by?: string | null
          conversation_link?: string | null
          created_at?: string
          cycle_id?: string | null
          first_message?: string | null
          id?: string
          latest_message?: string | null
          lead_id?: string | null
          phone: string
          received_at?: string
          source_id?: string | null
          wa_name?: string | null
        }
        Update: {
          captured_at?: string | null
          captured_by?: string | null
          conversation_link?: string | null
          created_at?: string
          cycle_id?: string | null
          first_message?: string | null
          id?: string
          latest_message?: string | null
          lead_id?: string | null
          phone?: string
          received_at?: string
          source_id?: string | null
          wa_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbound_conversations_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "lead_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inbound_conversations_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_cycles: {
        Row: {
          close_reason: string | null
          closed_at: string | null
          cycle_no: number
          id: string
          lead_id: string
          open_reason: string | null
          opened_at: string
        }
        Insert: {
          close_reason?: string | null
          closed_at?: string | null
          cycle_no: number
          id?: string
          lead_id: string
          open_reason?: string | null
          opened_at?: string
        }
        Update: {
          close_reason?: string | null
          closed_at?: string | null
          cycle_no?: number
          id?: string
          lead_id?: string
          open_reason?: string | null
          opened_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_cycles_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_scenarios_log: {
        Row: {
          assignment_id: string | null
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          notes: string | null
          scenario: Database["public"]["Enums"]["scenario_code"]
        }
        Insert: {
          assignment_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          notes?: string | null
          scenario: Database["public"]["Enums"]["scenario_code"]
        }
        Update: {
          assignment_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          notes?: string | null
          scenario?: Database["public"]["Enums"]["scenario_code"]
        }
        Relationships: [
          {
            foreignKeyName: "lead_scenarios_log_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_scenarios_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_timeline: {
        Row: {
          activity: string
          actor: string | null
          at: string
          created_at: string
          customer_outcome: string | null
          deadline: string | null
          detail: string | null
          feedback_status: Database["public"]["Enums"]["feedback_status"] | null
          id: string
          lead_id: string | null
          new_owner: string | null
          new_stage: string | null
          next_action: string | null
          prev_owner: string | null
          prev_stage: string | null
          review_id: string | null
          score: number | null
          team: Database["public"]["Enums"]["review_team"] | null
        }
        Insert: {
          activity: string
          actor?: string | null
          at?: string
          created_at?: string
          customer_outcome?: string | null
          deadline?: string | null
          detail?: string | null
          feedback_status?:
            | Database["public"]["Enums"]["feedback_status"]
            | null
          id?: string
          lead_id?: string | null
          new_owner?: string | null
          new_stage?: string | null
          next_action?: string | null
          prev_owner?: string | null
          prev_stage?: string | null
          review_id?: string | null
          score?: number | null
          team?: Database["public"]["Enums"]["review_team"] | null
        }
        Update: {
          activity?: string
          actor?: string | null
          at?: string
          created_at?: string
          customer_outcome?: string | null
          deadline?: string | null
          detail?: string | null
          feedback_status?:
            | Database["public"]["Enums"]["feedback_status"]
            | null
          id?: string
          lead_id?: string | null
          new_owner?: string | null
          new_stage?: string | null
          next_action?: string | null
          prev_owner?: string | null
          prev_stage?: string | null
          review_id?: string | null
          score?: number | null
          team?: Database["public"]["Enums"]["review_team"] | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_timeline_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_timeline_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string
          current_owner: string | null
          current_scenario: Database["public"]["Enums"]["scenario_code"] | null
          id: string
          location_score: number
          location_text: string | null
          movein_bucket: Database["public"]["Enums"]["move_in_bucket"] | null
          movein_date: string | null
          movein_score: number
          phone: string
          priority: Database["public"]["Enums"]["lead_priority"] | null
          score: number
          status: string
          updated_at: string
          wa_name: string | null
          zone_id: string | null
        }
        Insert: {
          created_at?: string
          current_owner?: string | null
          current_scenario?: Database["public"]["Enums"]["scenario_code"] | null
          id?: string
          location_score?: number
          location_text?: string | null
          movein_bucket?: Database["public"]["Enums"]["move_in_bucket"] | null
          movein_date?: string | null
          movein_score?: number
          phone: string
          priority?: Database["public"]["Enums"]["lead_priority"] | null
          score?: number
          status?: string
          updated_at?: string
          wa_name?: string | null
          zone_id?: string | null
        }
        Update: {
          created_at?: string
          current_owner?: string | null
          current_scenario?: Database["public"]["Enums"]["scenario_code"] | null
          id?: string
          location_score?: number
          location_text?: string | null
          movein_bucket?: Database["public"]["Enums"]["move_in_bucket"] | null
          movein_date?: string | null
          movein_score?: number
          phone?: string
          priority?: Database["public"]["Enums"]["lead_priority"] | null
          score?: number
          status?: string
          updated_at?: string
          wa_name?: string | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      next_actions: {
        Row: {
          created_at: string
          created_by: string | null
          done_at: string | null
          due_at: string
          id: string
          kind: string
          lead_id: string
          notes: string | null
          owner_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          due_at: string
          id?: string
          kind: string
          lead_id: string
          notes?: string | null
          owner_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          due_at?: string
          id?: string
          kind?: string
          lead_id?: string
          notes?: string | null
          owner_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "next_actions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_scores: {
        Row: {
          attendance: number
          category: Database["public"]["Enums"]["perf_category"]
          computed_at: string
          conv_rate: number
          crm_discipline: number
          followup_rate: number
          id: string
          sla_rate: number
          tour_conv: number
          user_id: string
          window_days: number
        }
        Insert: {
          attendance?: number
          category?: Database["public"]["Enums"]["perf_category"]
          computed_at?: string
          conv_rate?: number
          crm_discipline?: number
          followup_rate?: number
          id?: string
          sla_rate?: number
          tour_conv?: number
          user_id: string
          window_days: number
        }
        Update: {
          attendance?: number
          category?: Database["public"]["Enums"]["perf_category"]
          computed_at?: string
          conv_rate?: number
          crm_discipline?: number
          followup_rate?: number
          id?: string
          sla_rate?: number
          tour_conv?: number
          user_id?: string
          window_days?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          is_available: boolean
          is_clocked_in: boolean
          is_restricted: boolean
          performer_category: Database["public"]["Enums"]["perf_category"]
          phone: string | null
          primary_zone_id: string | null
          team: Database["public"]["Enums"]["review_team"] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          is_available?: boolean
          is_clocked_in?: boolean
          is_restricted?: boolean
          performer_category?: Database["public"]["Enums"]["perf_category"]
          phone?: string | null
          primary_zone_id?: string | null
          team?: Database["public"]["Enums"]["review_team"] | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          is_available?: boolean
          is_clocked_in?: boolean
          is_restricted?: boolean
          performer_category?: Database["public"]["Enums"]["perf_category"]
          phone?: string | null
          primary_zone_id?: string | null
          team?: Database["public"]["Enums"]["review_team"] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_primary_zone_id_fkey"
            columns: ["primary_zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          ack: Database["public"]["Enums"]["ack_choice"] | null
          ack_at: string | null
          assignment_id: string | null
          band: Database["public"]["Enums"]["review_band"]
          closed_at: string | null
          closed_by: string | null
          correct_approach: string | null
          correction_note: string | null
          corrective_action: string | null
          created_at: string
          critical_error: boolean
          critical_reasons: string[]
          customer_impact: string | null
          deadline: string | null
          employee_explanation: Json
          evidence: string[]
          id: string
          kind: Database["public"]["Enums"]["review_kind"]
          lead_id: string | null
          mandatory_reason: string | null
          occurred_at: string
          re_review_of: string | null
          review_day: string
          reviewee_id: string
          reviewer_comment: string | null
          reviewer_id: string | null
          scores: Json
          source_ref: string | null
          status: Database["public"]["Enums"]["feedback_status"]
          submitted_at: string | null
          tags: string[]
          team: Database["public"]["Enums"]["review_team"]
          total_score: number
          transcript: string | null
          updated_at: string
          verification:
            | Database["public"]["Enums"]["verification_result"]
            | null
          what_happened: string | null
          what_was_missed: string | null
        }
        Insert: {
          ack?: Database["public"]["Enums"]["ack_choice"] | null
          ack_at?: string | null
          assignment_id?: string | null
          band?: Database["public"]["Enums"]["review_band"]
          closed_at?: string | null
          closed_by?: string | null
          correct_approach?: string | null
          correction_note?: string | null
          corrective_action?: string | null
          created_at?: string
          critical_error?: boolean
          critical_reasons?: string[]
          customer_impact?: string | null
          deadline?: string | null
          employee_explanation?: Json
          evidence?: string[]
          id?: string
          kind?: Database["public"]["Enums"]["review_kind"]
          lead_id?: string | null
          mandatory_reason?: string | null
          occurred_at?: string
          re_review_of?: string | null
          review_day?: string
          reviewee_id: string
          reviewer_comment?: string | null
          reviewer_id?: string | null
          scores?: Json
          source_ref?: string | null
          status?: Database["public"]["Enums"]["feedback_status"]
          submitted_at?: string | null
          tags?: string[]
          team?: Database["public"]["Enums"]["review_team"]
          total_score?: number
          transcript?: string | null
          updated_at?: string
          verification?:
            | Database["public"]["Enums"]["verification_result"]
            | null
          what_happened?: string | null
          what_was_missed?: string | null
        }
        Update: {
          ack?: Database["public"]["Enums"]["ack_choice"] | null
          ack_at?: string | null
          assignment_id?: string | null
          band?: Database["public"]["Enums"]["review_band"]
          closed_at?: string | null
          closed_by?: string | null
          correct_approach?: string | null
          correction_note?: string | null
          corrective_action?: string | null
          created_at?: string
          critical_error?: boolean
          critical_reasons?: string[]
          customer_impact?: string | null
          deadline?: string | null
          employee_explanation?: Json
          evidence?: string[]
          id?: string
          kind?: Database["public"]["Enums"]["review_kind"]
          lead_id?: string | null
          mandatory_reason?: string | null
          occurred_at?: string
          re_review_of?: string | null
          review_day?: string
          reviewee_id?: string
          reviewer_comment?: string | null
          reviewer_id?: string | null
          scores?: Json
          source_ref?: string | null
          status?: Database["public"]["Enums"]["feedback_status"]
          submitted_at?: string | null
          tags?: string[]
          team?: Database["public"]["Enums"]["review_team"]
          total_score?: number
          transcript?: string | null
          updated_at?: string
          verification?:
            | Database["public"]["Enums"]["verification_result"]
            | null
          what_happened?: string | null
          what_was_missed?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_re_review_of_fkey"
            columns: ["re_review_of"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_breaches: {
        Row: {
          assignment_id: string
          breached_at: string
          id: string
          kind: Database["public"]["Enums"]["sla_kind"]
          resolved_at: string | null
        }
        Insert: {
          assignment_id: string
          breached_at?: string
          id?: string
          kind: Database["public"]["Enums"]["sla_kind"]
          resolved_at?: string | null
        }
        Update: {
          assignment_id?: string
          breached_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["sla_kind"]
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sla_breaches_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_properties: {
        Row: {
          created_at: string
          doc: Json
          enabled: boolean
          id: string
          key: string
          notes: string | null
          source: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          doc?: Json
          enabled?: boolean
          id?: string
          key: string
          notes?: string | null
          source?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          doc?: Json
          enabled?: boolean
          id?: string
          key?: string
          notes?: string | null
          source?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
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
      whatsapp_sources: {
        Row: {
          campaign: string | null
          created_at: string
          id: string
          is_active: boolean
          label: string
          updated_at: string
          wa_number: string
        }
        Insert: {
          campaign?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          updated_at?: string
          wa_number: string
        }
        Update: {
          campaign?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          updated_at?: string
          wa_number?: string
        }
        Relationships: []
      }
      workload_points: {
        Row: {
          active_no_next_action: number
          max_points: number
          overdue_followups: number
          points: number
          positive_no_quote: number
          sla_breaches_open: number
          state: Database["public"]["Enums"]["availability_state"]
          tours_no_outcome: number
          uncontacted: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active_no_next_action?: number
          max_points?: number
          overdue_followups?: number
          points?: number
          positive_no_quote?: number
          sla_breaches_open?: number
          state?: Database["public"]["Enums"]["availability_state"]
          tours_no_outcome?: number
          uncontacted?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active_no_next_action?: number
          max_points?: number
          overdue_followups?: number
          points?: number
          positive_no_quote?: number
          sla_breaches_open?: number
          state?: Database["public"]["Enums"]["availability_state"]
          tours_no_outcome?: number
          uncontacted?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      zone_membership: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          user_id: string
          zone_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          user_id: string
          zone_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          user_id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zone_membership_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      zones: {
        Row: {
          code: string
          created_at: string
          id: string
          inventory_strength: number
          is_serviceable: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          inventory_strength?: number
          is_serviceable?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          inventory_strength?: number
          is_serviceable?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      any_role: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_tower_ops: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      ack_choice: "understood" | "need_clarification" | "disagree"
      app_role:
        | "admin"
        | "manager"
        | "operator"
        | "sales"
        | "control_tower"
        | "founder_admin"
        | "zone_manager"
      assignment_state:
        | "pending_accept"
        | "accepted"
        | "declined"
        | "reassigned"
        | "completed"
        | "expired"
      availability_state:
        | "available"
        | "near_capacity"
        | "blocked"
        | "unavailable"
        | "restricted"
      feedback_status:
        | "new"
        | "viewed"
        | "acknowledged"
        | "correction_pending"
        | "submitted"
        | "re_review_pending"
        | "closed"
        | "escalated"
      lead_priority: "super_hot" | "hot" | "active" | "future" | "nurture"
      move_in_bucket:
        | "today"
        | "within_3d"
        | "within_7d"
        | "within_15d"
        | "within_30d"
        | "more_30d"
        | "not_confirmed"
      perf_category: "A" | "B" | "C" | "D"
      review_band: "gold" | "strong" | "coaching" | "risk" | "critical"
      review_kind: "chat" | "call" | "lead_journey"
      review_team:
        | "control_tower"
        | "flow_ops"
        | "pcm"
        | "closing"
        | "cross_functional"
      scenario_code:
        | "connected_qualified"
        | "connected_incomplete"
        | "callback_requested"
        | "no_answer"
        | "whatsapp_sent"
        | "wrong_number"
        | "duplicate"
        | "location_changed"
        | "date_changed"
        | "future_movein"
        | "tour_ready"
        | "virtual_tour"
        | "pre_booking"
        | "not_serviceable"
        | "not_interested"
        | "invalid_spam"
      sla_kind: "accept" | "first_action"
      verification_result:
        | "closed_correctly"
        | "partially_corrected"
        | "correction_rejected"
        | "customer_unreachable"
        | "manager_intervention"
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
      ack_choice: ["understood", "need_clarification", "disagree"],
      app_role: [
        "admin",
        "manager",
        "operator",
        "sales",
        "control_tower",
        "founder_admin",
        "zone_manager",
      ],
      assignment_state: [
        "pending_accept",
        "accepted",
        "declined",
        "reassigned",
        "completed",
        "expired",
      ],
      availability_state: [
        "available",
        "near_capacity",
        "blocked",
        "unavailable",
        "restricted",
      ],
      feedback_status: [
        "new",
        "viewed",
        "acknowledged",
        "correction_pending",
        "submitted",
        "re_review_pending",
        "closed",
        "escalated",
      ],
      lead_priority: ["super_hot", "hot", "active", "future", "nurture"],
      move_in_bucket: [
        "today",
        "within_3d",
        "within_7d",
        "within_15d",
        "within_30d",
        "more_30d",
        "not_confirmed",
      ],
      perf_category: ["A", "B", "C", "D"],
      review_band: ["gold", "strong", "coaching", "risk", "critical"],
      review_kind: ["chat", "call", "lead_journey"],
      review_team: [
        "control_tower",
        "flow_ops",
        "pcm",
        "closing",
        "cross_functional",
      ],
      scenario_code: [
        "connected_qualified",
        "connected_incomplete",
        "callback_requested",
        "no_answer",
        "whatsapp_sent",
        "wrong_number",
        "duplicate",
        "location_changed",
        "date_changed",
        "future_movein",
        "tour_ready",
        "virtual_tour",
        "pre_booking",
        "not_serviceable",
        "not_interested",
        "invalid_spam",
      ],
      sla_kind: ["accept", "first_action"],
      verification_result: [
        "closed_correctly",
        "partially_corrected",
        "correction_rejected",
        "customer_unreachable",
        "manager_intervention",
      ],
    },
  },
} as const
