import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { authService } from '@/services';
import { Button } from '@/components/ui/button';
import { Input, Label, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/index';
import { Shield, AlertCircle, CheckCircle2 } from 'lucide-react';

const schema = z.object({
  fullName:      z.string().min(2, 'Full name is required'),
  email:         z.string().email('Invalid email'),
  password:      z.string().min(8, 'Password must be at least 8 characters'),
  publisherName: z.string().min(2, 'Publisher name is required'),
});

type FormData = z.infer<typeof schema>;

export default function SignupPage() {
  const navigate = useNavigate();
  const [error, setError]   = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setError(null);
    try {
      await authService.register({
        name:          data.fullName,
        email:         data.email,
        password:      data.password,
        publisherName: data.publisherName,
      });
      setPending(true);
      toast.success('Registration received — pending super admin approval.', { duration: 5000 });
    } catch (err: any) {
      const message = err.response?.data?.message || 'Registration failed';
      setError(message);
      toast.error(message, { duration: 5000 });
    }
  };

  if (pending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="p-8 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <h2 className="text-lg font-semibold">Request submitted</h2>
            <p className="text-sm text-muted-foreground">
              Your account is <strong>pending super admin approval</strong>. You'll be able to
              sign in once an administrator approves your access.
            </p>
            <Button className="w-full" onClick={() => navigate('/login')}>Back to sign in</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
            <Shield className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Lead_Tracking</h1>
          <p className="text-sm text-muted-foreground">Request agent access</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Sign Up</CardTitle>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input id="fullName" placeholder="Jane Doe" {...register('fullName')} />
                {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@example.com" {...register('email')} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="••••••••" {...register('password')} />
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="publisherName">Publisher name</Label>
                {/* Manual entry — no dropdown. Must match the name provided by your admin. */}
                <Input id="publisherName" placeholder="Enter your publisher name" {...register('publisherName')} />
                {errors.publisherName && <p className="text-xs text-destructive">{errors.publisherName.message}</p>}
                <p className="text-xs text-muted-foreground">
                  Type the exact publisher name your administrator gave you.
                </p>
              </div>

              <Button type="submit" className="w-full" loading={isSubmitting}>
                Request access
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
