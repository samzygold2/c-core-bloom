-- Add is_pending column to profiles for pending approval status
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_pending boolean DEFAULT false;

-- Update the comment to clarify the flow:
-- is_pending = true: User selected an admin but awaiting approval
-- is_waiting = true: User was rejected or removed and needs to be picked up by another admin
-- Both false with assigned_admin_id: User is approved and assigned