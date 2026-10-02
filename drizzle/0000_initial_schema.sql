CREATE TYPE "public"."actor_type" AS ENUM('ADMIN', 'SYSTEM', 'CUSTOMER');--> statement-breakpoint
CREATE TYPE "public"."order_override_type" AS ENUM('MIN_PREORDER_DAYS', 'BOOKING_HORIZON', 'PICKUP_CUTOFF', 'DAILY_CAPACITY');--> statement-breakpoint
CREATE TYPE "public"."order_source" AS ENUM('WEBSITE', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('NEW', 'CONFIRMED', 'PROCESSING', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."payment_exception_kind" AS ENUM('LATE_PAYMENT_AFTER_CANCEL', 'AMOUNT_MISMATCH', 'DUPLICATE_PAYMENT');--> statement-breakpoint
CREATE TYPE "public"."payment_exception_resolution" AS ENUM('REFUNDED', 'RESOLVED_MANUALLY');--> statement-breakpoint
CREATE TYPE "public"."payment_exception_status" AS ENUM('OPEN', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('QRIS', 'BANK_TRANSFER', 'CASH');--> statement-breakpoint
CREATE TYPE "public"."payment_option" AS ENUM('DP_50', 'FULL');--> statement-breakpoint
CREATE TYPE "public"."payment_purpose" AS ENUM('DP', 'FULL', 'REMAINING');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('UNPAID', 'WAITING_PAYMENT', 'WAITING_VERIFICATION', 'PARTIALLY_PAID', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."payment_transaction_status" AS ENUM('WAITING_PAYMENT', 'WAITING_VERIFICATION', 'PAID', 'FAILED', 'EXPIRED', 'VOIDED');--> statement-breakpoint
CREATE TYPE "public"."product_availability" AS ENUM('AVAILABLE', 'SOLD_OUT');--> statement-breakpoint
CREATE TYPE "public"."product_type" AS ENUM('READY_STOCK', 'PRE_ORDER');--> statement-breakpoint
CREATE TYPE "public"."proof_verification_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "admin_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "admin_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'ADMIN' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"image_key" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"alt_text" text NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price" integer NOT NULL,
	"sale_price" integer,
	"product_type" "product_type" NOT NULL,
	"minimum_preorder_days" integer,
	"is_featured" boolean DEFAULT false NOT NULL,
	"availability" "product_availability" DEFAULT 'AVAILABLE' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"max_quantity_per_order" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "products_price_non_negative" CHECK ("products"."price" >= 0),
	CONSTRAINT "products_sale_price_valid" CHECK ("products"."sale_price" IS NULL OR ("products"."sale_price" >= 0 AND "products"."sale_price" < "products"."price")),
	CONSTRAINT "products_preorder_days_valid" CHECK (("products"."product_type" = 'PRE_ORDER' AND "products"."minimum_preorder_days" IS NOT NULL AND "products"."minimum_preorder_days" >= 1) OR ("products"."product_type" = 'READY_STOCK' AND "products"."minimum_preorder_days" IS NULL)),
	CONSTRAINT "products_max_qty_positive" CHECK ("products"."max_quantity_per_order" IS NULL OR "products"."max_quantity_per_order" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name_snapshot" text NOT NULL,
	"product_type_snapshot" "product_type" NOT NULL,
	"minimum_preorder_days_snapshot" integer,
	"unit_price_snapshot" integer NOT NULL,
	"sale_price_snapshot" integer,
	"effective_unit_price" integer NOT NULL,
	"quantity" integer NOT NULL,
	"line_subtotal" integer NOT NULL,
	CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_amounts_non_negative" CHECK ("order_items"."effective_unit_price" >= 0 AND "order_items"."line_subtotal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"override_type" "order_override_type" NOT NULL,
	"value_before" jsonb NOT NULL,
	"value_after" jsonb NOT NULL,
	"reason" text NOT NULL,
	"admin_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_overrides_reason_not_blank" CHECK (length(trim("order_overrides"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"tracking_token_hash" text NOT NULL,
	"source" "order_source" NOT NULL,
	"created_by_admin_id" text,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"notes" text,
	"order_date_effective" date NOT NULL,
	"pickup_date" date NOT NULL,
	"subtotal" integer NOT NULL,
	"discount_total" integer DEFAULT 0 NOT NULL,
	"grand_total" integer NOT NULL,
	"dp_amount" integer,
	"paid_amount" integer DEFAULT 0 NOT NULL,
	"remaining_amount" integer NOT NULL,
	"order_status" "order_status" DEFAULT 'NEW' NOT NULL,
	"payment_status" "payment_status" NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"payment_option" "payment_option" NOT NULL,
	"reservation_expires_at" timestamp with time zone,
	"cancellation_reason" text,
	"cancelled_by_type" "actor_type",
	"cancelled_by_admin_id" text,
	"cancelled_at" timestamp with time zone,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "orders_tracking_token_hash_unique" UNIQUE("tracking_token_hash"),
	CONSTRAINT "orders_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "orders_amounts_non_negative" CHECK ("orders"."subtotal" >= 0 AND "orders"."discount_total" >= 0 AND "orders"."grand_total" >= 0 AND "orders"."paid_amount" >= 0 AND "orders"."remaining_amount" >= 0),
	CONSTRAINT "orders_dp_amount_valid" CHECK ("orders"."dp_amount" IS NULL OR "orders"."dp_amount" >= 0),
	CONSTRAINT "orders_cash_full_only" CHECK ("orders"."payment_method" <> 'CASH' OR "orders"."payment_option" = 'FULL')
);
--> statement-breakpoint
CREATE TABLE "payment_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_transaction_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" "payment_exception_kind" NOT NULL,
	"status" "payment_exception_status" DEFAULT 'OPEN' NOT NULL,
	"resolution" "payment_exception_resolution",
	"resolution_note" text,
	"resolved_by_admin_id" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_transaction_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verification_status" "proof_verification_status" DEFAULT 'PENDING' NOT NULL,
	"rejection_reason" text,
	"verified_by_admin_id" text,
	"verified_at" timestamp with time zone,
	CONSTRAINT "payment_proofs_mime_allowed" CHECK ("payment_proofs"."mime_type" IN ('image/jpeg', 'image/png', 'application/pdf')),
	CONSTRAINT "payment_proofs_size_limit" CHECK ("payment_proofs"."size_bytes" > 0 AND "payment_proofs"."size_bytes" <= 5242880)
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"purpose" "payment_purpose" NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount" integer NOT NULL,
	"status" "payment_transaction_status" NOT NULL,
	"provider" text,
	"provider_reference" text,
	"qr_string" text,
	"expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"verified_by_admin_id" text,
	"is_exception" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_transactions_provider_reference_unique" UNIQUE("provider","provider_reference"),
	CONSTRAINT "payment_transactions_amount_positive" CHECK ("payment_transactions"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_key" text NOT NULL,
	"payload_hash" text NOT NULL,
	"signature_valid" boolean NOT NULL,
	"processing_result" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "payment_webhook_events_provider_event_unique" UNIQUE("provider","provider_event_key")
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_transaction_id" uuid,
	"amount" integer NOT NULL,
	"status" text NOT NULL,
	"reason" text NOT NULL,
	"refunded_at" timestamp with time zone,
	"recorded_by_admin_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_amount_positive" CHECK ("refunds"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"event_type" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"reason" text,
	"actor_type" "actor_type" NOT NULL,
	"actor_admin_id" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pickup_dates" (
	"date" date PRIMARY KEY NOT NULL,
	"capacity_override" integer,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"block_reason" text,
	"updated_by_admin_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pickup_dates_capacity_non_negative" CHECK ("pickup_dates"."capacity_override" IS NULL OR "pickup_dates"."capacity_override" >= 0)
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by_admin_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_accounts" ADD CONSTRAINT "admin_accounts_user_id_admins_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_user_id_admins_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_overrides" ADD CONSTRAINT "order_overrides_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_overrides" ADD CONSTRAINT "order_overrides_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_admin_id_admins_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_admin_id_admins_id_fk" FOREIGN KEY ("cancelled_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_exceptions" ADD CONSTRAINT "payment_exceptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_exceptions" ADD CONSTRAINT "payment_exceptions_resolved_by_admin_id_admins_id_fk" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_exceptions" ADD CONSTRAINT "payment_exceptions_transaction_fk" FOREIGN KEY ("payment_transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_verified_by_admin_id_admins_id_fk" FOREIGN KEY ("verified_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_transaction_fk" FOREIGN KEY ("payment_transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_verified_by_admin_id_admins_id_fk" FOREIGN KEY ("verified_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_transaction_id_payment_transactions_id_fk" FOREIGN KEY ("payment_transaction_id") REFERENCES "public"."payment_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_recorded_by_admin_id_admins_id_fk" FOREIGN KEY ("recorded_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_admin_id_admins_id_fk" FOREIGN KEY ("actor_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_dates" ADD CONSTRAINT "pickup_dates_updated_by_admin_id_admins_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_admin_id_admins_id_fk" FOREIGN KEY ("updated_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_accounts_user_id_idx" ON "admin_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "admin_sessions_user_id_idx" ON "admin_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "product_images_product_id_idx" ON "product_images" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_one_main_per_product" ON "product_images" USING btree ("product_id") WHERE "product_images"."is_main" = true;--> statement-breakpoint
CREATE INDEX "products_category_id_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_overrides_order_id_idx" ON "order_overrides" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_pickup_date_status_idx" ON "orders" USING btree ("pickup_date","order_status");--> statement-breakpoint
CREATE INDEX "orders_status_reservation_idx" ON "orders" USING btree ("order_status","reservation_expires_at");--> statement-breakpoint
CREATE INDEX "payment_exceptions_status_idx" ON "payment_exceptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_proofs_transaction_idx" ON "payment_proofs" USING btree ("payment_transaction_id");--> statement-breakpoint
CREATE INDEX "payment_transactions_order_id_idx" ON "payment_transactions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_transactions_status_expires_idx" ON "payment_transactions" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "refunds_order_id_idx" ON "refunds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");