-- The relay credential is encrypted by the control plane before persistence.
ALTER TABLE "nodes" ADD COLUMN "relay_secret_encrypted" TEXT;
