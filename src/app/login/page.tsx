"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Shield } from 'lucide-react';

export default function LoginPage() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password })
      });

      const data = await res.json();

      if (res.ok) {
        router.push('/admin');
        router.refresh();
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F5F3] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%231B4332' fill-opacity='1'%3E%3Ccircle cx='7' cy='7' r='1.5'/%3E%3Ccircle cx='37' cy='37' r='1.5'/%3E%3C/g%3E%3C/svg%3E")`,
      }} />

      {/* Top Brand Bar */}
      <div className="absolute top-0 left-0 right-0 h-2 upkem-header-gradient" />
      
      <div className="max-w-md w-full relative z-10">
        {/* Logo & Branding */}
        <div className="text-center mb-10">
          <div className="w-24 h-24 mx-auto mb-6 relative">
            <div className="absolute inset-0 bg-brand-800/10 rounded-3xl rotate-6" />
            <div className="relative bg-white rounded-2xl p-3 shadow-lg shadow-brand-800/10 border border-brand-200/50">
              <img 
                src="/pharma_logo.jpeg" 
                alt="Upkem Labs" 
                className="w-full h-full object-contain rounded-lg"
              />
            </div>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-brand-900">UPKEM LABS</h1>
          <p className="text-brand-600 font-semibold mt-1.5 text-sm tracking-wide uppercase">We Build Trust Not Medicine</p>
        </div>

        <Card className="border-0 shadow-xl shadow-brand-800/8 rounded-2xl overflow-hidden ring-1 ring-brand-200/30 bg-white">
          <div className="h-1.5 w-full upkem-header-gradient" />
          <CardHeader className="px-8 pt-8 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-brand-50 rounded-lg">
                <Shield className="w-4 h-4 text-brand-700" />
              </div>
              <CardTitle className="text-xl font-bold text-brand-900">Admin Access</CardTitle>
            </div>
            <CardDescription className="text-brand-600/70 text-base">
              Enter your credentials to access the command center.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <form onSubmit={handleLogin} className="space-y-5">
              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm font-semibold flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-bold text-brand-800">Phone Number</label>
                <Input 
                  type="tel"
                  placeholder="e.g. 6383945610" 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-12 border-brand-200 bg-brand-50/30 text-base font-medium rounded-xl focus-visible:ring-brand-500 focus-visible:border-brand-400 placeholder:text-brand-300"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-brand-800">Password</label>
                <Input 
                  type="password"
                  placeholder="••••••••" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 border-brand-200 bg-brand-50/30 text-base font-medium rounded-xl focus-visible:ring-brand-500 focus-visible:border-brand-400 placeholder:text-brand-300"
                  required
                />
              </div>
              <Button 
                type="submit" 
                className="w-full h-12 bg-brand-800 hover:bg-brand-700 text-white rounded-xl font-bold text-base shadow-lg shadow-brand-800/20 transition-all mt-4 cursor-pointer"
                disabled={loading}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Access Dashboard"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-brand-400 text-xs font-medium mt-8 tracking-wide">
          UPKEM LABS © {new Date().getFullYear()} — B2B Wholesale Platform
        </p>
      </div>
    </div>
  );
}
