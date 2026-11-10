DROP INDEX "orders_user_id_index";--> statement-breakpoint
CREATE INDEX "orders_user_id_created_at_index" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "tickets_order_id_index" ON "tickets" USING btree ("order_id");