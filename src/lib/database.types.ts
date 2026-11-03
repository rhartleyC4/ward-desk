
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "absences": {
                  Row: {
                    "created_at": string,"ends_on": string,"id": string,"location": string | null,"starts_on": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ends_on": string,"id"?: string,"location"?: string | null,"starts_on": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"ends_on"?: string,"id"?: string,"location"?: string | null,"starts_on"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "absences_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"agenda_attendees": {
                  Row: {
                    "template_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "template_id": string,"user_id": string
                  }
                  Update: {
                    "template_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agenda_attendees_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "agenda_templates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agenda_attendees_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"agenda_items": {
                  Row: {
                    "body": string,"created_at": string,"created_by": string | null,"event_date": string | null,"id": string,"kind": Database["public"]['Enums']["agenda_item_kind"],"resolved_on": string | null,"section_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"created_by"?: string | null,"event_date"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["agenda_item_kind"],"resolved_on"?: string | null,"section_id": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"created_by"?: string | null,"event_date"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["agenda_item_kind"],"resolved_on"?: string | null,"section_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agenda_items_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agenda_items_section_id_fkey"
      columns: ["section_id"]
isOneToOne: false
      referencedRelation: "agenda_sections"
      referencedColumns: ["id"]
    }
                  ]
                },"agenda_sections": {
                  Row: {
                    "id": string,"kind": Database["public"]['Enums']["agenda_section_kind"],"position": number,"template_id": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"kind": Database["public"]['Enums']["agenda_section_kind"],"position": number,"template_id": string,"title": string
                  }
                  Update: {
                    "id"?: string,"kind"?: Database["public"]['Enums']["agenda_section_kind"],"position"?: number,"template_id"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agenda_sections_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "agenda_templates"
      referencedColumns: ["id"]
    }
                  ]
                },"agenda_templates": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"position": number,"slug": string,"start_time": string | null,"weekday": number,"weeks_of_month": (number)[] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"position"?: number,"slug": string,"start_time"?: string | null,"weekday"?: number,"weeks_of_month"?: (number)[] | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"position"?: number,"slug"?: string,"start_time"?: string | null,"weekday"?: number,"weeks_of_month"?: (number)[] | null
                  }
                  Relationships: [
                    
                  ]
                },"agendas": {
                  Row: {
                    "closing_prayer": string | null,"created_at": string,"id": string,"meeting_date": string,"notes": string | null,"opening_prayer": string | null,"spiritual_thought": string | null,"start_time": string | null,"template_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "closing_prayer"?: string | null,"created_at"?: string,"id"?: string,"meeting_date": string,"notes"?: string | null,"opening_prayer"?: string | null,"spiritual_thought"?: string | null,"start_time"?: string | null,"template_id"?: string
                  }
                  Update: {
                    "closing_prayer"?: string | null,"created_at"?: string,"id"?: string,"meeting_date"?: string,"notes"?: string | null,"opening_prayer"?: string | null,"spiritual_thought"?: string | null,"start_time"?: string | null,"template_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agendas_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "agenda_templates"
      referencedColumns: ["id"]
    }
                  ]
                },"allowlist": {
                  Row: {
                    "created_at": string,"email": string,"initial_office": Database["public"]['Enums']["bishopric_office"] | null,"initial_roles": (Database["public"]['Enums']["app_role"])[],"invited_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"initial_office"?: Database["public"]['Enums']["bishopric_office"] | null,"initial_roles"?: (Database["public"]['Enums']["app_role"])[],"invited_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"initial_office"?: Database["public"]['Enums']["bishopric_office"] | null,"initial_roles"?: (Database["public"]['Enums']["app_role"])[],"invited_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"calling_candidates": {
                  Row: {
                    "calling_title": string | null,"created_at": string,"id": string,"need_id": string | null,"notes": string | null,"person_name": string,"status": Database["public"]['Enums']["candidate_status"],"suggested_by": string | null,"sustain_on": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "calling_title"?: string | null,"created_at"?: string,"id"?: string,"need_id"?: string | null,"notes"?: string | null,"person_name": string,"status"?: Database["public"]['Enums']["candidate_status"],"suggested_by"?: string | null,"sustain_on"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "calling_title"?: string | null,"created_at"?: string,"id"?: string,"need_id"?: string | null,"notes"?: string | null,"person_name"?: string,"status"?: Database["public"]['Enums']["candidate_status"],"suggested_by"?: string | null,"sustain_on"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "calling_candidates_need_id_fkey"
      columns: ["need_id"]
isOneToOne: false
      referencedRelation: "calling_needs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "calling_candidates_suggested_by_fkey"
      columns: ["suggested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"calling_needs": {
                  Row: {
                    "calling_id": string | null,"calling_title": string,"created_at": string,"id": string,"notes": string | null,"release_name": string | null,"release_on": string | null,"status": Database["public"]['Enums']["need_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "calling_id"?: string | null,"calling_title": string,"created_at"?: string,"id"?: string,"notes"?: string | null,"release_name"?: string | null,"release_on"?: string | null,"status"?: Database["public"]['Enums']["need_status"],"updated_at"?: string
                  }
                  Update: {
                    "calling_id"?: string | null,"calling_title"?: string,"created_at"?: string,"id"?: string,"notes"?: string | null,"release_name"?: string | null,"release_on"?: string | null,"status"?: Database["public"]['Enums']["need_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "calling_needs_calling_id_fkey"
      columns: ["calling_id"]
isOneToOne: false
      referencedRelation: "callings"
      referencedColumns: ["id"]
    }
                  ]
                },"callings": {
                  Row: {
                    "created_at": string,"id": string,"organization": string | null,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"organization"?: string | null,"title": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"organization"?: string | null,"title"?: string
                  }
                  Relationships: [
                    
                  ]
                },"interviews": {
                  Row: {
                    "candidate_id": string | null,"created_at": string,"id": string,"interviewer_id": string | null,"location": string | null,"notes": string | null,"person_name": string | null,"purpose": Database["public"]['Enums']["interview_purpose"],"scheduled_at": string,"status": Database["public"]['Enums']["interview_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "candidate_id"?: string | null,"created_at"?: string,"id"?: string,"interviewer_id"?: string | null,"location"?: string | null,"notes"?: string | null,"person_name"?: string | null,"purpose"?: Database["public"]['Enums']["interview_purpose"],"scheduled_at": string,"status"?: Database["public"]['Enums']["interview_status"]
                  }
                  Update: {
                    "candidate_id"?: string | null,"created_at"?: string,"id"?: string,"interviewer_id"?: string | null,"location"?: string | null,"notes"?: string | null,"person_name"?: string | null,"purpose"?: Database["public"]['Enums']["interview_purpose"],"scheduled_at"?: string,"status"?: Database["public"]['Enums']["interview_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "interviews_candidate_id_fkey"
      columns: ["candidate_id"]
isOneToOne: false
      referencedRelation: "calling_candidates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "interviews_interviewer_id_fkey"
      columns: ["interviewer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"meetings": {
                  Row: {
                    "benediction": string | null,"closing_hymn": number | null,"conducting_id": string | null,"created_at": string,"id": string,"invocation": string | null,"meeting_date": string,"meeting_type": Database["public"]['Enums']["meeting_type"],"notes": string | null,"opening_hymn": number | null,"presiding": string | null,"sacrament_hymn": number | null,"title": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "benediction"?: string | null,"closing_hymn"?: number | null,"conducting_id"?: string | null,"created_at"?: string,"id"?: string,"invocation"?: string | null,"meeting_date": string,"meeting_type"?: Database["public"]['Enums']["meeting_type"],"notes"?: string | null,"opening_hymn"?: number | null,"presiding"?: string | null,"sacrament_hymn"?: number | null,"title"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "benediction"?: string | null,"closing_hymn"?: number | null,"conducting_id"?: string | null,"created_at"?: string,"id"?: string,"invocation"?: string | null,"meeting_date"?: string,"meeting_type"?: Database["public"]['Enums']["meeting_type"],"notes"?: string | null,"opening_hymn"?: number | null,"presiding"?: string | null,"sacrament_hymn"?: number | null,"title"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meetings_conducting_id_fkey"
      columns: ["conducting_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"prayer_roll": {
                  Row: {
                    "added_on": string,"id": string,"name": string,"removed_on": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "added_on"?: string,"id"?: string,"name": string,"removed_on"?: string | null
                  }
                  Update: {
                    "added_on"?: string,"id"?: string,"name"?: string,"removed_on"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string | null,"email": string,"id": string,"office": Database["public"]['Enums']["bishopric_office"] | null,"short_name": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string | null,"email": string,"id": string,"office"?: Database["public"]['Enums']["bishopric_office"] | null,"short_name"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string | null,"email"?: string,"id"?: string,"office"?: Database["public"]['Enums']["bishopric_office"] | null,"short_name"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"program_items": {
                  Row: {
                    "created_at": string,"hymn_number": number | null,"id": string,"kind": Database["public"]['Enums']["program_item_kind"],"meeting_id": string,"note": string | null,"person_name": string | null,"position": number,"status": Database["public"]['Enums']["assignment_status"],"topic": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"hymn_number"?: number | null,"id"?: string,"kind"?: Database["public"]['Enums']["program_item_kind"],"meeting_id": string,"note"?: string | null,"person_name"?: string | null,"position": number,"status"?: Database["public"]['Enums']["assignment_status"],"topic"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"hymn_number"?: number | null,"id"?: string,"kind"?: Database["public"]['Enums']["program_item_kind"],"meeting_id"?: string,"note"?: string | null,"person_name"?: string | null,"position"?: number,"status"?: Database["public"]['Enums']["assignment_status"],"topic"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "program_items_meeting_id_fkey"
      columns: ["meeting_id"]
isOneToOne: false
      referencedRelation: "meetings"
      referencedColumns: ["id"]
    }
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"id": string,"p256dh": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"id"?: string,"p256dh": string,"user_id"?: string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"id"?: string,"p256dh"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"recurring_events": {
                  Row: {
                    "created_at": string,"id": string,"notes": string | null,"start_time": string | null,"title": string,"week_of_month": number | null,"weekday": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"notes"?: string | null,"start_time"?: string | null,"title": string,"week_of_month"?: number | null,"weekday": number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"notes"?: string | null,"start_time"?: string | null,"title"?: string,"week_of_month"?: number | null,"weekday"?: number
                  }
                  Relationships: [
                    
                  ]
                },"roles": {
                  Row: {
                    "granted_at": string,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted_at"?: string,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  Update: {
                    "granted_at"?: string,"role"?: Database["public"]['Enums']["app_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "roles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"rotations": {
                  Row: {
                    "assignee_id": string | null,"assignee_label": string | null,"created_at": string,"id": string,"months": (number)[],"notes": string | null,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assignee_id"?: string | null,"assignee_label"?: string | null,"created_at"?: string,"id"?: string,"months": (number)[],"notes"?: string | null,"title": string
                  }
                  Update: {
                    "assignee_id"?: string | null,"assignee_label"?: string | null,"created_at"?: string,"id"?: string,"months"?: (number)[],"notes"?: string | null,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rotations_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"stewardships": {
                  Row: {
                    "area": string,"created_at": string,"id": string,"notes": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "area": string,"created_at"?: string,"id"?: string,"notes"?: string | null,"user_id": string
                  }
                  Update: {
                    "area"?: string,"created_at"?: string,"id"?: string,"notes"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stewardships_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "attends":
{ Args: { "template": string }; Returns: boolean
                           },
"attends_section":
{ Args: { "section": string }; Returns: boolean
                           },
"bishopric_template":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"can_manage_meetings":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"can_use_prayer_roll":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"delete_agenda_section":
{ Args: { "section": string }; Returns: undefined
                           },
"delete_agenda_template":
{ Args: { "template": string }; Returns: undefined
                           },
"has_any_role":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"has_role":
{ Args: { "check_role": Database["public"]['Enums']["app_role"] }; Returns: boolean
                           },
"is_planner":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"legacy_agenda_section":
{ Args: { "item_kind": Database["public"]['Enums']["agenda_item_kind"] }; Returns: string
                           },
"reorder_agenda_sections":
{ Args: { "section_ids": (string)[],"template": string }; Returns: undefined
                           }
          }
          Enums: {
            "agenda_item_kind": "discussion"|"calendar"|"ordination"|"missionary","agenda_section_kind": "items"|"calendar"|"interviews"|"assignments"|"sacrament"|"callings"|"releases"|"sustainings"|"prayer_roll"|"closing_prayer","app_role": "admin"|"bishopric"|"scheduler"|"leader","assignment_status": "planned"|"invited"|"confirmed"|"declined","bishopric_office": "bishop"|"first_counselor"|"second_counselor"|"executive_secretary"|"ward_clerk","candidate_status": "suggested"|"discussing"|"approved"|"extended"|"accepted"|"declined"|"sustained"|"set_apart","interview_purpose": "calling"|"temple_recommend"|"ppi"|"youth"|"tithing_declaration"|"advancement"|"other","interview_status": "scheduled"|"completed"|"cancelled","meeting_type": "regular"|"fast_sunday"|"stake_conference"|"general_conference"|"ward_conference"|"special_program","need_status": "open"|"filled"|"cancelled","program_item_kind": "talk"|"musical_number"|"intermediate_hymn"|"testimonies"|"other"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "agenda_item_kind": ["discussion", "calendar", "ordination", "missionary"],"agenda_section_kind": ["items", "calendar", "interviews", "assignments", "sacrament", "callings", "releases", "sustainings", "prayer_roll", "closing_prayer"],"app_role": ["admin", "bishopric", "scheduler", "leader"],"assignment_status": ["planned", "invited", "confirmed", "declined"],"bishopric_office": ["bishop", "first_counselor", "second_counselor", "executive_secretary", "ward_clerk"],"candidate_status": ["suggested", "discussing", "approved", "extended", "accepted", "declined", "sustained", "set_apart"],"interview_purpose": ["calling", "temple_recommend", "ppi", "youth", "tithing_declaration", "advancement", "other"],"interview_status": ["scheduled", "completed", "cancelled"],"meeting_type": ["regular", "fast_sunday", "stake_conference", "general_conference", "ward_conference", "special_program"],"need_status": ["open", "filled", "cancelled"],"program_item_kind": ["talk", "musical_number", "intermediate_hymn", "testimonies", "other"]
          }
        }
} as const
