    def warm_cache(self, chunks):
        if not self.add_cache_headers:
            return
        if not self.num_cache_warming_pings:
            return
        if not self.ok_to_warm_cache:
            return

        delay = 5 * 60 - 5
        delay = float(os.environ.get("AIDER_CACHE_KEEPALIVE_DELAY", delay))
        self.next_cache_warm = time.time() + delay
        self.warming_pings_left = self.num_cache_warming_pings
        self.cache_warming_chunks = chunks

        if self.cache_warming_thread:
            return

        def warm_cache_worker():
            while self.ok_to_warm_cache:
                time.sleep(1)
                if self.warming_pings_left <= 0:
                    continue
                now = time.time()
                if now < self.next_cache_warm:
                    continue

                self.warming_pings_left -= 1
                self.next_cache_warm = time.time() + delay

                kwargs = dict(self.main_model.extra_params) or dict()
                kwargs["max_tokens"] = 1

                try:
                    completion = litellm.completion(
                        model=self.main_model.name,
                        messages=self.cache_warming_chunks.cacheable_messages(),
                        stream=False,
                        **kwargs,
                    )
                except Exception as err:
                    self.io.tool_warning(f"Cache warming error: {str(err)}")
                    continue

                cache_hit_tokens = getattr(
                    completion.usage, "prompt_cache_hit_tokens", 0
                ) or getattr(completion.usage, "cache_read_input_tokens", 0)

                if self.verbose:
                    self.io.tool_output(f"Warmed {format_tokens(cache_hit_tokens)} cached tokens.")

        self.cache_warming_thread = threading.Timer(0, warm_cache_worker)
        self.cache_warming_thread.daemon = True
        self.cache_warming_thread.start()

        return chunks