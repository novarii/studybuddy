"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  KeyIcon,
  ExternalLinkIcon,
  ZapIcon,
  CreditCardIcon,
  ShieldCheckIcon,
  SunIcon,
  MoonIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { darkModeColors, lightModeColors } from "@/constants/colors";

export function OnboardingClient() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const colors = isDarkMode ? darkModeColors : lightModeColors;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
  }, [isDarkMode]);

  // Handle OAuth error params
  useEffect(() => {
    const error = searchParams.get("error");
    if (error?.startsWith("oauth_")) {
      toast({
        title: "Connection failed",
        description: "Failed to connect OpenRouter API key. Please try again.",
        variant: "destructive",
      });
      router.replace("/onboarding");
    }
  }, [searchParams, router, toast]);

  const handleConnect = () => {
    window.location.href = "/api/openrouter/connect";
  };

  const benefits = [
    { icon: ZapIcon, text: "Access to multiple AI models" },
    { icon: CreditCardIcon, text: "Pay only for what you use" },
    { icon: ShieldCheckIcon, text: "Your key stays encrypted (AES-256-GCM)" },
  ];

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ backgroundColor: colors.background }}
    >
      {/* Dark mode toggle */}
      <button
        className="absolute top-4 right-4 p-2 rounded-lg transition-colors"
        style={{ color: colors.secondaryText }}
        onClick={() => setIsDarkMode(!isDarkMode)}
        aria-label="Toggle dark mode"
      >
        {isDarkMode ? (
          <SunIcon className="w-5 h-5" />
        ) : (
          <MoonIcon className="w-5 h-5" />
        )}
      </button>

      <div className="w-full max-w-md space-y-6">
        {/* Key icon badge */}
        <div className="flex justify-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: colors.panel }}
          >
            <KeyIcon className="w-8 h-8" style={{ color: colors.accent }} />
          </div>
        </div>

        {/* Heading */}
        <div className="text-center space-y-2">
          <h1
            className="text-2xl font-bold"
            style={{ color: colors.primaryText }}
          >
            Welcome to StudyBuddy
          </h1>
          <p className="text-sm" style={{ color: colors.secondaryText }}>
            One more step — connect your OpenRouter account to power AI chat
          </p>
        </div>

        {/* Why OpenRouter card */}
        <div
          className="rounded-lg p-4 space-y-3"
          style={{ backgroundColor: colors.panel, borderColor: colors.border }}
        >
          <p
            className="text-sm font-medium"
            style={{ color: colors.primaryText }}
          >
            Why OpenRouter?
          </p>
          <div className="space-y-2">
            {benefits.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <Icon
                  className="w-4 h-4 flex-shrink-0"
                  style={{ color: colors.accent }}
                />
                <span
                  className="text-sm"
                  style={{ color: colors.secondaryText }}
                >
                  {text}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Connect button */}
        <Button
          onClick={handleConnect}
          className="w-full"
          style={{ backgroundColor: colors.accent, color: "#fff" }}
        >
          Connect with OpenRouter
          <ExternalLinkIcon className="w-4 h-4 ml-2" />
        </Button>

        {/* Sign up link */}
        <p
          className="text-xs text-center"
          style={{ color: colors.secondaryText }}
        >
          Don&apos;t have an account?{" "}
          <a
            href="https://openrouter.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:no-underline"
            style={{ color: colors.accent }}
          >
            Sign up at OpenRouter
          </a>
        </p>
      </div>
    </div>
  );
}
