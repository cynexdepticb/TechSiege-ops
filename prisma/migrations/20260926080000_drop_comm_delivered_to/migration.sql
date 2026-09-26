-- Reverts the `deliveredTo` column added while email was being redirected to the
-- organiser's inbox. That redirect is gone: outbound mail now goes to the real
-- recipient via Gmail SMTP, so `recipientEmail` is again the actual destination
-- and a second column recording a different one would only invite confusion.
ALTER TABLE "communication_logs" DROP COLUMN "deliveredTo";
