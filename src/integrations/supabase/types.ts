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
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      damaged_products: {
        Row: {
          created_at: string
          created_by: string
          id: string
          loss_value: number
          product_id: string
          qty: number
          reason: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          loss_value?: number
          product_id: string
          qty: number
          reason?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          loss_value?: number
          product_id?: string
          qty?: number
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "damaged_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      held_bills: {
        Row: {
          bill_discount: number
          cart: Json
          cashier_id: string
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          id: string
          label: string | null
        }
        Insert: {
          bill_discount?: number
          cart: Json
          cashier_id: string
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          label?: string | null
        }
        Update: {
          bill_discount?: number
          cart?: Json
          cashier_id?: string
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          label?: string | null
        }
        Relationships: []
      }
      product_returns: {
        Row: {
          created_at: string
          created_by: string
          id: string
          product_id: string
          qty: number
          reason: string | null
          refund_amount: number
          restock: boolean
          sale_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          product_id: string
          qty: number
          reason?: string | null
          refund_amount?: number
          restock?: boolean
          sale_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          product_id?: string
          qty?: number
          reason?: string | null
          refund_amount?: number
          restock?: boolean
          sale_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_returns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          brand: string | null
          category_id: string | null
          created_at: string
          expiry_date: string | null
          id: string
          image_url: string | null
          is_active: boolean
          last_sold_at: string | null
          margin_pct: number
          max_qty: number
          mfg_date: string | null
          min_qty: number
          mrp: number
          name: string
          net_weight_g: number | null
          price_per_kg: number
          purchase_price: number
          selling_price: number
          sold_by: string
          stock_qty: number
          tax_pct: number
          unit: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          category_id?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          last_sold_at?: string | null
          margin_pct?: number
          max_qty?: number
          mfg_date?: string | null
          min_qty?: number
          mrp?: number
          name: string
          net_weight_g?: number | null
          price_per_kg?: number
          purchase_price?: number
          selling_price?: number
          sold_by?: string
          stock_qty?: number
          tax_pct?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          category_id?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          last_sold_at?: string | null
          margin_pct?: number
          max_qty?: number
          mfg_date?: string | null
          min_qty?: number
          mrp?: number
          name?: string
          net_weight_g?: number | null
          price_per_kg?: number
          purchase_price?: number
          selling_price?: number
          sold_by?: string
          stock_qty?: number
          tax_pct?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      purchase_entries: {
        Row: {
          created_at: string
          created_by: string
          id: string
          invoice_no: string | null
          notes: string | null
          supplier: string | null
          total: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          invoice_no?: string | null
          notes?: string | null
          supplier?: string | null
          total?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          invoice_no?: string | null
          notes?: string | null
          supplier?: string | null
          total?: number
        }
        Relationships: []
      }
      purchase_items: {
        Row: {
          cost: number
          created_at: string
          entry_id: string
          id: string
          name: string
          product_id: string | null
          qty: number
        }
        Insert: {
          cost?: number
          created_at?: string
          entry_id: string
          id?: string
          name: string
          product_id?: string | null
          qty: number
        }
        Update: {
          cost?: number
          created_at?: string
          entry_id?: string
          id?: string
          name?: string
          product_id?: string | null
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "purchase_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string
          id: string
          po_id: string
          product_id: string | null
          product_name: string
          qty: number
          unit: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          po_id: string
          product_id?: string | null
          product_name: string
          qty?: number
          unit?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          po_id?: string
          product_id?: string | null
          product_name?: string
          qty?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          order_no: string | null
          status: string
          supplier_id: string | null
          supplier_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          order_no?: string | null
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          order_no?: string | null
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          created_at: string
          id: string
          line_discount: number
          line_total: number
          name: string
          product_id: string | null
          qty: number
          sale_id: string
          tax_pct: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_discount?: number
          line_total: number
          name: string
          product_id?: string | null
          qty: number
          sale_id: string
          tax_pct?: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          line_discount?: number
          line_total?: number
          name?: string
          product_id?: string | null
          qty?: number
          sale_id?: string
          tax_pct?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          bill_discount: number
          bill_no: string
          cashier_id: string
          change_amount: number
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          grand_total: number
          id: string
          line_discount: number
          notes: string | null
          paid_amount: number
          payment_mode: string
          status: string
          subtotal: number
          tax_total: number
        }
        Insert: {
          bill_discount?: number
          bill_no: string
          cashier_id: string
          change_amount?: number
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          grand_total?: number
          id?: string
          line_discount?: number
          notes?: string | null
          paid_amount?: number
          payment_mode?: string
          status?: string
          subtotal?: number
          tax_total?: number
        }
        Update: {
          bill_discount?: number
          bill_no?: string
          cashier_id?: string
          change_amount?: number
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          grand_total?: number
          id?: string
          line_discount?: number
          notes?: string | null
          paid_amount?: number
          payment_mode?: string
          status?: string
          subtotal?: number
          tax_total?: number
        }
        Relationships: []
      }
      shop_settings: {
        Row: {
          address: string | null
          created_at: string
          gst_number: string | null
          id: number
          phone: string | null
          receipt_footer: string | null
          shop_name: string
          updated_at: string
          upi_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          gst_number?: string | null
          id?: number
          phone?: string | null
          receipt_footer?: string | null
          shop_name?: string
          updated_at?: string
          upi_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          gst_number?: string | null
          id?: number
          phone?: string | null
          receipt_footer?: string | null
          shop_name?: string
          updated_at?: string
          upi_id?: string | null
        }
        Relationships: []
      }
      stock_adjustments: {
        Row: {
          created_at: string
          created_by: string
          delta: number
          id: string
          notes: string | null
          product_id: string
          reason: string
        }
        Insert: {
          created_at?: string
          created_by: string
          delta: number
          id?: string
          notes?: string | null
          product_id: string
          reason: string
        }
        Update: {
          created_at?: string
          created_by?: string
          delta?: number
          id?: string
          notes?: string | null
          product_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          gst_number: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
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
      cleanup_old_sales: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      next_bill_no: { Args: never; Returns: string }
    }
    Enums: {
      app_role: "admin" | "manager" | "cashier"
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
      app_role: ["admin", "manager", "cashier"],
    },
  },
} as const
