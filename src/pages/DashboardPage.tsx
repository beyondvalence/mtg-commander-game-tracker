import { Heart, Play, Share2 } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-10 px-4 py-6 md:px-8">
      <section className="overflow-hidden rounded-[2.5rem] border border-zinc-500/70 bg-zinc-100">
        <div className="grid lg:grid-cols-[1fr_1fr]">
          <div className="border-b border-zinc-500/70 lg:border-b-0 lg:border-r">
            <div className="border-b border-zinc-500/70 px-8 py-10 md:px-12">
              <h1 className="text-6xl font-black tracking-tight text-zinc-900 md:text-8xl">Food Mood</h1>
            </div>

            <div className="border-b border-zinc-500/70 px-8 py-10 md:px-12">
              <p className="max-w-2xl text-3xl leading-tight text-zinc-800 md:text-5xl md:leading-tight">
                Get inspiration for your next meal and create new recipes mixing influences from two cuisines,
                generated with the help of Google AI.
              </p>
            </div>

            <div className="border-b border-zinc-500/70 px-8 py-10 md:px-12">
              <p className="text-xl leading-relaxed text-zinc-700 md:text-3xl">
                Mar 27, 2024 | With Google Arts &amp; Culture Lab Artists in Residence Emmanuel Durgoni and
                Gaël Hugo
              </p>
              <div className="mt-8 flex gap-3">
                {['Food', 'Travel'].map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-zinc-500/60 px-5 py-2 text-lg font-medium text-zinc-700 md:px-7 md:py-3 md:text-2xl"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-[1fr_auto_auto] divide-x divide-zinc-500/70">
              <button className="m-6 flex items-center justify-center gap-4 rounded-full bg-[#5B6016] px-8 py-5 text-2xl font-medium text-zinc-100 transition hover:brightness-110 md:text-3xl">
                <Play className="h-7 w-7 fill-current" />
                Launch experiment
              </button>
              <button className="flex aspect-square items-center justify-center p-5 text-zinc-700 hover:bg-zinc-200">
                <Heart className="h-9 w-9" />
              </button>
              <button className="flex aspect-square items-center justify-center p-5 text-zinc-700 hover:bg-zinc-200">
                <Share2 className="h-9 w-9" />
              </button>
            </div>
          </div>

          <div className="p-6 md:p-8">
            <img
              src="https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=1400&q=80"
              alt="Colorful dishes arranged on a table"
              className="h-full min-h-[560px] w-full rounded-[2rem] object-cover"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
