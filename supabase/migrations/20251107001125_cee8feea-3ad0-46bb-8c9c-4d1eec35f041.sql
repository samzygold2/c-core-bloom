-- Create app_role enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create profiles table for user information
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- User roles policies
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Create tests table
CREATE TABLE public.tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes IN (30, 60)),
  total_questions INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on tests
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;

-- Tests policies - everyone can view active tests
CREATE POLICY "Anyone can view active tests"
  ON public.tests
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage tests"
  ON public.tests
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Create questions table
CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID REFERENCES public.tests(id) ON DELETE CASCADE NOT NULL,
  question_text TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_answer INTEGER NOT NULL,
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')) DEFAULT 'medium',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on questions
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

-- Questions policies
CREATE POLICY "Users can view questions for active tests"
  ON public.questions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tests
      WHERE tests.id = questions.test_id AND tests.is_active = true
    )
  );

CREATE POLICY "Admins can manage questions"
  ON public.questions
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Create user_tests table to track test sessions
CREATE TABLE public.user_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  test_id UUID REFERENCES public.tests(id) ON DELETE CASCADE NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  end_time TIMESTAMP WITH TIME ZONE,
  score INTEGER,
  answers JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on user_tests
ALTER TABLE public.user_tests ENABLE ROW LEVEL SECURITY;

-- User tests policies
CREATE POLICY "Users can view their own test sessions"
  ON public.user_tests
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own test sessions"
  ON public.user_tests
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own test sessions"
  ON public.user_tests
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all test sessions"
  ON public.user_tests
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Create audit_log table for admin actions
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on audit_log
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Audit log policies
CREATE POLICY "Admins can view audit logs"
  ON public.audit_log
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert audit logs"
  ON public.audit_log
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create indexes for performance
CREATE INDEX idx_questions_test_id ON public.questions(test_id);
CREATE INDEX idx_user_tests_user_id ON public.user_tests(user_id);
CREATE INDEX idx_user_tests_start_time ON public.user_tests(start_time);

-- Function to update total_questions when questions are added/removed
CREATE OR REPLACE FUNCTION public.update_test_question_count()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.tests
    SET total_questions = total_questions + 1
    WHERE id = NEW.test_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.tests
    SET total_questions = total_questions - 1
    WHERE id = OLD.test_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Trigger to automatically update question count
CREATE TRIGGER update_question_count_trigger
AFTER INSERT OR DELETE ON public.questions
FOR EACH ROW
EXECUTE FUNCTION public.update_test_question_count();

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  
  -- Assign default 'user' role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

-- Trigger for new user registration
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();