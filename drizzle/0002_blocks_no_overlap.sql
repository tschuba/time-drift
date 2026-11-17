CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
-- Minutes since midnight; open end = unbounded; end < start wraps past midnight. Half-open, so back-to-back blocks are fine.
ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_no_overlap" EXCLUDE USING gist (
  "entry_id" WITH =,
  int4range(
    (extract(hour from "start_time") * 60 + extract(minute from "start_time"))::int,
    CASE WHEN "end_time" IS NULL THEN 2147483647
      ELSE (extract(hour from "end_time") * 60 + extract(minute from "end_time"))::int + CASE WHEN "end_time" < "start_time" THEN 1440 ELSE 0 END
    END
  ) WITH &&
);
