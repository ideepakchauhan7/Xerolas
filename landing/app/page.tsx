import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { Downloads } from "@/components/downloads";
import { SocialProof } from "@/components/social-proof";
import { Features } from "@/components/features";
import { BigFeatures } from "@/components/big-features";
import { Testimonials } from "@/components/testimonials";
import { BentoFeatures } from "@/components/bento-features";
import { Exchanges } from "@/components/exchanges";
import { FAQ } from "@/components/faq";
import { CTA } from "@/components/cta";
import { Footer } from "@/components/footer";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#080808] text-white overflow-x-hidden">
      <Navbar />
      <main>
        <Hero />
        <Downloads />
        <SocialProof />
        <Features />
        <BigFeatures />
        <Testimonials />
        <BentoFeatures />
        <Exchanges />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
