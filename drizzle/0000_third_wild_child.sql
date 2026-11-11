CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
--> statement-breakpoint
CREATE TABLE "time_blocks" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"entry_id" uuid NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time,
	"break_hours" numeric(4, 2) DEFAULT '0' NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"date" date NOT NULL,
	"target_hours" numeric(4, 2) DEFAULT '8.0' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_entries_date_unique" UNIQUE("date")
);
--> statement-breakpoint
ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_entry_id_time_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."time_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_time_blocks_entry_id" ON "time_blocks" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "idx_time_entries_date_desc" ON "time_entries" USING btree ("date" DESC NULLS LAST);