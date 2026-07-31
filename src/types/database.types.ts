export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          metadata: Json
          user_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          metadata?: Json
          user_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          metadata?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_items: {
        Row: {
          allocated_amount: number | null
          bill_id: string
          id: string
          order_item_id: string
          quantity: number
        }
        Insert: {
          allocated_amount?: number | null
          bill_id: string
          id?: string
          order_item_id: string
          quantity?: number
        }
        Update: {
          allocated_amount?: number | null
          bill_id?: string
          id?: string
          order_item_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills_active"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          invoice_requested: boolean
          order_id: string
          paid_at: string | null
          split_group_id: string | null
          split_label: string | null
          split_mode: string | null
          status: Database["public"]["Enums"]["bill_status"]
          subtotal: number
          tip_amount: number
          tip_percent: number | null
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          invoice_requested?: boolean
          order_id: string
          paid_at?: string | null
          split_group_id?: string | null
          split_label?: string | null
          split_mode?: string | null
          status?: Database["public"]["Enums"]["bill_status"]
          subtotal?: number
          tip_amount?: number
          tip_percent?: number | null
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          invoice_requested?: boolean
          order_id?: string
          paid_at?: string | null
          split_group_id?: string | null
          split_label?: string | null
          split_mode?: string | null
          status?: Database["public"]["Enums"]["bill_status"]
          subtotal?: number
          tip_amount?: number
          tip_percent?: number | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bills_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_active"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_shifts: {
        Row: {
          card_sales: number | null
          cash_sales: number | null
          closed_at: string | null
          closed_by: string | null
          closing_amount: number | null
          expected_cash_amount: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opening_amount: number
          total_sales: number | null
          transfer_sales: number | null
        }
        Insert: {
          card_sales?: number | null
          cash_sales?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closing_amount?: number | null
          expected_cash_amount?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by: string
          opening_amount?: number
          total_sales?: number | null
          transfer_sales?: number | null
        }
        Update: {
          card_sales?: number | null
          cash_sales?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closing_amount?: number | null
          expected_cash_amount?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_amount?: number
          total_sales?: number | null
          transfer_sales?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_shifts_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_shifts_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      invoice_events: {
        Row: {
          created_at: string
          from_status: Database["public"]["Enums"]["sri_status"] | null
          id: string
          invoice_id: string
          payload: Json | null
          to_status: Database["public"]["Enums"]["sri_status"]
        }
        Insert: {
          created_at?: string
          from_status?: Database["public"]["Enums"]["sri_status"] | null
          id?: string
          invoice_id: string
          payload?: Json | null
          to_status: Database["public"]["Enums"]["sri_status"]
        }
        Update: {
          created_at?: string
          from_status?: Database["public"]["Enums"]["sri_status"] | null
          id?: string
          invoice_id?: string
          payload?: Json | null
          to_status?: Database["public"]["Enums"]["sri_status"]
        }
        Relationships: [
          {
            foreignKeyName: "invoice_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_active"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          access_key: string | null
          authorization_number: string | null
          authorized_at: string | null
          bill_id: string
          created_at: string
          customer_address: string | null
          customer_email: string | null
          customer_name: string
          customer_ruc: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          invoice_type: Database["public"]["Enums"]["invoice_type"]
          ride_url: string | null
          sri_response: Json | null
          sri_status: Database["public"]["Enums"]["sri_status"]
          updated_at: string
          xml_url: string | null
        }
        Insert: {
          access_key?: string | null
          authorization_number?: string | null
          authorized_at?: string | null
          bill_id: string
          created_at?: string
          customer_address?: string | null
          customer_email?: string | null
          customer_name: string
          customer_ruc?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          invoice_type?: Database["public"]["Enums"]["invoice_type"]
          ride_url?: string | null
          sri_response?: Json | null
          sri_status?: Database["public"]["Enums"]["sri_status"]
          updated_at?: string
          xml_url?: string | null
        }
        Update: {
          access_key?: string | null
          authorization_number?: string | null
          authorized_at?: string | null
          bill_id?: string
          created_at?: string
          customer_address?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_ruc?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          invoice_type?: Database["public"]["Enums"]["invoice_type"]
          ride_url?: string | null
          sri_response?: Json | null
          sri_status?: Database["public"]["Enums"]["sri_status"]
          updated_at?: string
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills_active"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_stations: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      menu_item_stations: {
        Row: {
          menu_item_id: string
          station_id: string
        }
        Insert: {
          menu_item_id: string
          station_id: string
        }
        Update: {
          menu_item_id?: string
          station_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_stations_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_stations_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items_active"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_stations_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "kitchen_stations"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category_id: string
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          image_url: string | null
          name: string
          price: number
          sort_order: number
          status: Database["public"]["Enums"]["menu_item_status"]
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          price: number
          sort_order?: number
          status?: Database["public"]["Enums"]["menu_item_status"]
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number
          sort_order?: number
          status?: Database["public"]["Enums"]["menu_item_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          cancelled_at: string | null
          created_at: string
          id: string
          menu_item_id: string
          modified_at: string | null
          modified_seen_at: string | null
          notes: string | null
          order_id: string
          price_at_order: number
          quantity: number
          served_quantity: number
          split_account_label: string | null
          status: Database["public"]["Enums"]["order_item_status"]
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          id?: string
          menu_item_id: string
          modified_at?: string | null
          modified_seen_at?: string | null
          notes?: string | null
          order_id: string
          price_at_order: number
          quantity: number
          served_quantity?: number
          split_account_label?: string | null
          status?: Database["public"]["Enums"]["order_item_status"]
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          id?: string
          menu_item_id?: string
          modified_at?: string | null
          modified_seen_at?: string | null
          notes?: string | null
          order_id?: string
          price_at_order?: number
          quantity?: number
          served_quantity?: number
          split_account_label?: string | null
          status?: Database["public"]["Enums"]["order_item_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items_active"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_active"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cash_shift_id: string | null
          closed_at: string | null
          created_at: string
          customer_name: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          notes: string | null
          order_type: string
          status: Database["public"]["Enums"]["order_status"]
          table_id: string | null
          takeaway_number: number | null
          updated_at: string
          waiter_id: string
        }
        Insert: {
          cash_shift_id?: string | null
          closed_at?: string | null
          created_at?: string
          customer_name?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          notes?: string | null
          order_type?: string
          status?: Database["public"]["Enums"]["order_status"]
          table_id?: string | null
          takeaway_number?: number | null
          updated_at?: string
          waiter_id: string
        }
        Update: {
          cash_shift_id?: string | null
          closed_at?: string | null
          created_at?: string
          customer_name?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          notes?: string | null
          order_type?: string
          status?: Database["public"]["Enums"]["order_status"]
          table_id?: string | null
          takeaway_number?: number | null
          updated_at?: string
          waiter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_cash_shift_id_fkey"
            columns: ["cash_shift_id"]
            isOneToOne: false
            referencedRelation: "cash_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_waiter_id_fkey"
            columns: ["waiter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bill_id: string
          created_by: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          paid_at: string
          reference: string | null
        }
        Insert: {
          amount: number
          bill_id: string
          created_by?: string | null
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          paid_at?: string
          reference?: string | null
        }
        Update: {
          amount?: number
          bill_id?: string
          created_by?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          paid_at?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills_active"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email: string
          id: string
          name: string
          role: Database["public"]["Enums"]["user_role"]
          temp_password: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email: string
          id: string
          name: string
          role?: Database["public"]["Enums"]["user_role"]
          temp_password?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["user_role"]
          temp_password?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_secrets: {
        Row: {
          cert_password: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          cert_password: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          cert_password?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_secrets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_tables: {
        Row: {
          capacity: number
          created_at: string
          id: string
          merged_group_id: string | null
          number: number
          position_x: number
          position_y: number
          shape: string
          status: Database["public"]["Enums"]["table_status"]
          updated_at: string
        }
        Insert: {
          capacity: number
          created_at?: string
          id?: string
          merged_group_id?: string | null
          number: number
          position_x?: number
          position_y?: number
          shape?: string
          status?: Database["public"]["Enums"]["table_status"]
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          id?: string
          merged_group_id?: string | null
          number?: number
          position_x?: number
          position_y?: number
          shape?: string
          status?: Database["public"]["Enums"]["table_status"]
          updated_at?: string
        }
        Relationships: []
      }
      restaurants: {
        Row: {
          address: string | null
          commercial_name: string | null
          created_at: string
          default_tip_percent: number
          email: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          ruc: string
          sri_cert_expires_at: string | null
          sri_cert_filename: string | null
          sri_cert_storage_path: string | null
          sri_emission_point_code: string
          sri_environment: Database["public"]["Enums"]["sri_environment"]
          sri_establishment_code: string
          sri_obligado_contabilidad: string
          theme_config: Json | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          commercial_name?: string | null
          created_at?: string
          default_tip_percent?: number
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          ruc: string
          sri_cert_expires_at?: string | null
          sri_cert_filename?: string | null
          sri_cert_storage_path?: string | null
          sri_emission_point_code?: string
          sri_environment?: Database["public"]["Enums"]["sri_environment"]
          sri_establishment_code?: string
          sri_obligado_contabilidad?: string
          theme_config?: Json | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          commercial_name?: string | null
          created_at?: string
          default_tip_percent?: number
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          ruc?: string
          sri_cert_expires_at?: string | null
          sri_cert_filename?: string | null
          sri_cert_storage_path?: string | null
          sri_emission_point_code?: string
          sri_environment?: Database["public"]["Enums"]["sri_environment"]
          sri_establishment_code?: string
          sri_obligado_contabilidad?: string
          theme_config?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      sri_invoice_sequences: {
        Row: {
          doc_type: string
          emission_point_code: string
          establishment_code: string
          id: string
          last_sequential: number
          updated_at: string
        }
        Insert: {
          doc_type?: string
          emission_point_code: string
          establishment_code: string
          id?: string
          last_sequential?: number
          updated_at?: string
        }
        Update: {
          doc_type?: string
          emission_point_code?: string
          establishment_code?: string
          id?: string
          last_sequential?: number
          updated_at?: string
        }
        Relationships: []
      }
      table_assignments: {
        Row: {
          assigned_at: string
          id: string
          released_at: string | null
          table_id: string
          waiter_id: string
        }
        Insert: {
          assigned_at?: string
          id?: string
          released_at?: string | null
          table_id: string
          waiter_id: string
        }
        Update: {
          assigned_at?: string
          id?: string
          released_at?: string | null
          table_id?: string
          waiter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_assignments_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_assignments_waiter_id_fkey"
            columns: ["waiter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_config: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          rate: number
          tax_name: string
        }
        Insert: {
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          rate: number
          tax_name: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          rate?: number
          tax_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      bills_active: {
        Row: {
          created_at: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string | null
          order_id: string | null
          paid_at: string | null
          status: Database["public"]["Enums"]["bill_status"] | null
          subtotal: number | null
          tip_amount: number | null
          tip_percent: number | null
          total: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string | null
          order_id?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["bill_status"] | null
          subtotal?: number | null
          tip_amount?: number | null
          tip_percent?: number | null
          total?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string | null
          order_id?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["bill_status"] | null
          subtotal?: number | null
          tip_amount?: number | null
          tip_percent?: number | null
          total?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_active"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices_active: {
        Row: {
          access_key: string | null
          authorized_at: string | null
          bill_id: string | null
          created_at: string | null
          customer_address: string | null
          customer_email: string | null
          customer_name: string | null
          customer_ruc: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string | null
          invoice_type: Database["public"]["Enums"]["invoice_type"] | null
          ride_url: string | null
          sri_response: Json | null
          sri_status: Database["public"]["Enums"]["sri_status"] | null
          updated_at: string | null
          xml_url: string | null
        }
        Insert: {
          access_key?: string | null
          authorized_at?: string | null
          bill_id?: string | null
          created_at?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_ruc?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string | null
          invoice_type?: Database["public"]["Enums"]["invoice_type"] | null
          ride_url?: string | null
          sri_response?: Json | null
          sri_status?: Database["public"]["Enums"]["sri_status"] | null
          updated_at?: string | null
          xml_url?: string | null
        }
        Update: {
          access_key?: string | null
          authorized_at?: string | null
          bill_id?: string | null
          created_at?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_ruc?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string | null
          invoice_type?: Database["public"]["Enums"]["invoice_type"] | null
          ride_url?: string | null
          sri_response?: Json | null
          sri_status?: Database["public"]["Enums"]["sri_status"] | null
          updated_at?: string | null
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills_active"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items_active: {
        Row: {
          category_id: string | null
          created_at: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string | null
          image_url: string | null
          name: string | null
          price: number | null
          sort_order: number | null
          status: Database["public"]["Enums"]["menu_item_status"] | null
          updated_at: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          name?: string | null
          price?: number | null
          sort_order?: number | null
          status?: Database["public"]["Enums"]["menu_item_status"] | null
          updated_at?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          name?: string | null
          price?: number | null
          sort_order?: number | null
          status?: Database["public"]["Enums"]["menu_item_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders_active: {
        Row: {
          cash_shift_id: string | null
          closed_at: string | null
          created_at: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string | null
          notes: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          table_id: string | null
          updated_at: string | null
          waiter_id: string | null
        }
        Insert: {
          cash_shift_id?: string | null
          closed_at?: string | null
          created_at?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          table_id?: string | null
          updated_at?: string | null
          waiter_id?: string | null
        }
        Update: {
          cash_shift_id?: string | null
          closed_at?: string | null
          created_at?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          table_id?: string | null
          updated_at?: string | null
          waiter_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_cash_shift_id_fkey"
            columns: ["cash_shift_id"]
            isOneToOne: false
            referencedRelation: "cash_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_waiter_id_fkey"
            columns: ["waiter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _payments_in_shift: {
        Args: { p_shift_id: string }
        Returns: {
          amount: number
          bill_id: string
          created_by: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          paid_at: string
          reference: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_create_staff_user: {
        Args: {
          p_email: string
          p_name: string
          p_password: string
          p_role: Database["public"]["Enums"]["user_role"]
        }
        Returns: string
      }
      admin_fetch_staff_profiles: {
        Args: never
        Returns: {
          active: boolean
          created_at: string
          email: string
          id: string
          name: string
          role: Database["public"]["Enums"]["user_role"]
          temp_password: string
          updated_at: string
        }[]
      }
      admin_set_user_active: {
        Args: { p_active: boolean; p_user_id: string }
        Returns: {
          active: boolean
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email: string
          id: string
          name: string
          role: Database["public"]["Enums"]["user_role"]
          temp_password: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_soft_delete_staff_user: {
        Args: { p_user_id: string }
        Returns: string
      }
      admin_update_staff_user: {
        Args: {
          p_name: string
          p_password?: string
          p_role: Database["public"]["Enums"]["user_role"]
          p_user_id: string
        }
        Returns: {
          active: boolean
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email: string
          id: string
          name: string
          role: Database["public"]["Enums"]["user_role"]
          temp_password: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      advance_bill_status: {
        Args: {
          p_bill_id: string
          p_new_status: Database["public"]["Enums"]["bill_status"]
        }
        Returns: Database["public"]["Enums"]["bill_status"]
      }
      advance_order_status: {
        Args: {
          p_new_status: Database["public"]["Enums"]["order_status"]
          p_order_id: string
        }
        Returns: Database["public"]["Enums"]["order_status"]
      }
      close_cash_shift: {
        Args: { p_declared_amount: number; p_notes?: string }
        Returns: {
          card_sales: number | null
          cash_sales: number | null
          closed_at: string | null
          closed_by: string | null
          closing_amount: number | null
          expected_cash_amount: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opening_amount: number
          total_sales: number | null
          transfer_sales: number | null
        }
        SetofOptions: {
          from: "*"
          to: "cash_shifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_order_bills: { Args: { p_order_id: string }; Returns: number }
      create_bill_from_order: {
        Args: { p_order_id: string; p_tip_percent?: number }
        Returns: string
      }
      create_equal_split_bills: {
        Args: { p_order_id: string; p_parts: number; p_tip_percent?: number }
        Returns: string
      }
      create_item_split_bills: {
        Args: { p_groups: Json; p_order_id: string; p_tip_percent?: number }
        Returns: string
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      dismiss_bill_invoice_request: {
        Args: { p_bill_id: string }
        Returns: boolean
      }
      fetch_invoice_audit_events: {
        Args: { p_limit?: number; p_status_filter?: string }
        Returns: {
          created_at: string
          from_status: Database["public"]["Enums"]["sri_status"] | null
          id: string
          invoice_id: string
          payload: Json | null
          to_status: Database["public"]["Enums"]["sri_status"]
        }[]
        SetofOptions: {
          from: "*"
          to: "invoice_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_active_cash_shift: {
        Args: never
        Returns: {
          card_sales: number | null
          cash_sales: number | null
          closed_at: string | null
          closed_by: string | null
          closing_amount: number | null
          expected_cash_amount: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opening_amount: number
          total_sales: number | null
          transfer_sales: number | null
        }
        SetofOptions: {
          from: "*"
          to: "cash_shifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_current_iva: { Args: never; Returns: number }
      get_daily_sales_report: { Args: { p_report_date: string }; Returns: Json }
      get_next_sri_sequential: {
        Args: {
          p_doc_type?: string
          p_emission_point: string
          p_establishment: string
        }
        Returns: number
      }
      get_next_takeaway_number: { Args: never; Returns: number }
      get_shift_live_summary: { Args: { p_shift_id: string }; Returns: Json }
      get_sri_invoice_metrics: { Args: never; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      is_kitchen: { Args: never; Returns: boolean }
      is_order_owner: { Args: { p_order_id: string }; Returns: boolean }
      is_waiter: { Args: never; Returns: boolean }
      is_waiter_assigned_to_table: {
        Args: { p_table_id: string }
        Returns: boolean
      }
      list_cash_shifts: {
        Args: { p_limit?: number }
        Returns: {
          card_sales: number | null
          cash_sales: number | null
          closed_at: string | null
          closed_by: string | null
          closing_amount: number | null
          expected_cash_amount: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opening_amount: number
          total_sales: number | null
          transfer_sales: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "cash_shifts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      open_cash_shift: {
        Args: { p_opening_amount: number }
        Returns: {
          card_sales: number | null
          cash_sales: number | null
          closed_at: string | null
          closed_by: string | null
          closing_amount: number | null
          expected_cash_amount: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opening_amount: number
          total_sales: number | null
          transfer_sales: number | null
        }
        SetofOptions: {
          from: "*"
          to: "cash_shifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      order_has_active_bills: { Args: { p_order_id: string }; Returns: boolean }
      register_payment: {
        Args: {
          p_amount: number
          p_bill_id: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_reference?: string
        }
        Returns: Database["public"]["Enums"]["bill_status"]
      }
      restore_bill: { Args: { p_id: string }; Returns: undefined }
      restore_invoice: { Args: { p_id: string }; Returns: undefined }
      restore_menu_item: { Args: { p_id: string }; Returns: undefined }
      restore_order: { Args: { p_id: string }; Returns: undefined }
      soft_delete_bill: {
        Args: { p_id: string; p_reason?: string }
        Returns: undefined
      }
      soft_delete_invoice: {
        Args: { p_id: string; p_reason?: string }
        Returns: undefined
      }
      soft_delete_menu_item: {
        Args: { p_id: string; p_reason?: string }
        Returns: undefined
      }
      soft_delete_order: {
        Args: { p_id: string; p_reason?: string }
        Returns: undefined
      }
      try_close_order_if_fully_paid: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      update_bill_tip: {
        Args: { p_bill_id: string; p_tip_percent: number }
        Returns: {
          created_at: string
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          invoice_requested: boolean
          order_id: string
          paid_at: string | null
          split_group_id: string | null
          split_label: string | null
          split_mode: string | null
          status: Database["public"]["Enums"]["bill_status"]
          subtotal: number
          tip_amount: number
          tip_percent: number | null
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "bills"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_table_status: {
        Args: { p_status: string; p_table_id: string }
        Returns: undefined
      }
      validate_bill_soft_delete: {
        Args: { p_bill_id: string }
        Returns: undefined
      }
      validate_invoice_soft_delete: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      validate_order_soft_delete: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      write_audit_log: {
        Args: {
          p_action: Database["public"]["Enums"]["audit_action"]
          p_entity: string
          p_entity_id: string
          p_metadata?: Json
        }
        Returns: string
      }
      write_audit_log_for_user: {
        Args: {
          p_action: Database["public"]["Enums"]["audit_action"]
          p_entity: string
          p_entity_id: string
          p_metadata?: Json
          p_user_id: string
        }
        Returns: string
      }
    }
    Enums: {
      audit_action:
        | "create"
        | "update"
        | "delete"
        | "soft_delete"
        | "restore"
        | "status_change"
        | "payment"
        | "invoice_emit"
        | "invoice_void"
        | "login"
        | "config_change"
      bill_status:
        | "draft"
        | "pending_payment"
        | "partially_paid"
        | "paid"
        | "voided"
        | "refunded"
      invoice_type: "invoice" | "sales_note"
      menu_item_status: "active" | "inactive" | "out_of_stock"
      order_item_status:
        | "pending"
        | "preparing"
        | "ready"
        | "served"
        | "cancelled"
      order_status:
        | "draft"
        | "open"
        | "in_progress"
        | "ready"
        | "served"
        | "closed"
        | "cancelled"
      payment_method: "cash" | "card" | "transfer"
      sri_environment: "test" | "production"
      sri_status:
        | "draft"
        | "xml_generated"
        | "signed"
        | "submitted"
        | "received"
        | "authorized"
        | "rejected"
        | "error"
        | "void_requested"
        | "voided"
      table_status: "available" | "occupied" | "reserved"
      user_role: "admin" | "waiter" | "kitchen"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          remote_table_id: string | null
          shard_id: string | null
          shard_key: string | null
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            isOneToOne: false
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      audit_action: [
        "create",
        "update",
        "delete",
        "soft_delete",
        "restore",
        "status_change",
        "payment",
        "invoice_emit",
        "invoice_void",
        "login",
        "config_change",
      ],
      bill_status: [
        "draft",
        "pending_payment",
        "partially_paid",
        "paid",
        "voided",
        "refunded",
      ],
      invoice_type: ["invoice", "sales_note"],
      menu_item_status: ["active", "inactive", "out_of_stock"],
      order_item_status: [
        "pending",
        "preparing",
        "ready",
        "served",
        "cancelled",
      ],
      order_status: [
        "draft",
        "open",
        "in_progress",
        "ready",
        "served",
        "closed",
        "cancelled",
      ],
      payment_method: ["cash", "card", "transfer"],
      sri_environment: ["test", "production"],
      sri_status: [
        "draft",
        "xml_generated",
        "signed",
        "submitted",
        "received",
        "authorized",
        "rejected",
        "error",
        "void_requested",
        "voided",
      ],
      table_status: ["available", "occupied", "reserved"],
      user_role: ["admin", "waiter", "kitchen"],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const

