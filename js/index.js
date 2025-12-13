 // --- 预设模型列表 (用于搜索提示) ---
        const PRESET_MODELS = [
            "nano banana pro",
            "nano banana",
            "豆包",
            "即梦"
          
        ];

        // --- 全局变量 ---
        let allData = [];
        const PAGE_SIZE = 20;

        let galleryState = {
            filteredData: [],
            currentPage: 1,
            searchQuery: ""
        };

        // --- 主题初始化 ---
        function initTheme() {
            const savedTheme = localStorage.getItem('theme') || 'dark';
            document.documentElement.setAttribute('data-theme', savedTheme);
            document.getElementById('theme-toggle').onclick = () => {
                const current = document.documentElement.getAttribute('data-theme');
                const next = current === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', next);
                localStorage.setItem('theme', next);
            };
        }

        async function init() {
            initTheme();
            setupSearchSuggestions(); // 初始化搜索提示逻辑

            try {
                const response = await fetch('json/data.json');
                allData = await response.json();
            } catch (error) {
                console.error(error);
                alert("读取 data.json 失败。");
                return;
            }

            const idParam = getQueryParam('id');
            const searchParam = getQueryParam('search');
            const pageParam = getQueryParam('page');

            if (idParam) {
                document.getElementById('detail-container').classList.add('active');
                renderDetailPage(parseInt(idParam));
                setupNavLinks(parseInt(idParam));
            } else {
                document.getElementById('home-container').classList.add('active');
                
                if (searchParam) {
                    galleryState.searchQuery = searchParam;
                    document.getElementById('search-input').value = searchParam;
                    performSearch(searchParam);
                } else {
                    // 默认全显示，按ID倒序
                    galleryState.filteredData = allData.filter(d => d.visible).sort((a, b) => b.id - a.id);
                    updateSearchResultText(galleryState.filteredData.length, false);
                }

                if (pageParam) {
                    galleryState.currentPage = parseInt(pageParam);
                }
                
                renderGallery();
                setupNavLinks(null);
            }

            setupEventHandlers();
        }

        // --- 核心逻辑：高级混合排序 ---

        function performSearch(query) {
            // 如果搜索为空，直接返回全部
            if (!query || query.trim() === "") {
                galleryState.filteredData = allData.filter(d => d.visible).sort((a, b) => b.id - a.id);
                updateSearchResultText(galleryState.filteredData.length, false);
                
                //记得把url改回来
                const url = new URL(window.location);
                url.searchParams.delete('search');
                galleryState.currentPage = 1;
                url.searchParams.set('page', galleryState.currentPage);
                url.searchParams.delete('id');
                
                window.history.replaceState({}, '', url);
                return;
            }

            // 预处理 query (全小写用于 prompt 包含匹配，原版用于 model/tag 精确匹配)
            // 注意：通常 Tag 和 Model 搜索也建议不区分大小写，这里为了体验设为不区分大小写
            const lowerQuery = query.toLowerCase();

            let results = [];

            allData.forEach(item => {
                if (!item.visible) return;

                // 1. Model 等于 (不区分大小写)
                const hitModel = item.model && item.model.some(m => m.toLowerCase() === lowerQuery);
                // 2. Tag 等于 (不区分大小写)
                const hitTag = item.tag && item.tag.some(t => t.toLowerCase() === lowerQuery);
                // 3. Prompt 包含
                const hitPrompt = item.prompt && item.prompt.toLowerCase().includes(lowerQuery);

                if (hitModel || hitTag || hitPrompt) {
                    // 计算优先级分数 (越小越靠前)
                    /*
                      1. (1+2+3) -> Score 1
                      2. (1+2)   -> Score 2
                      3. (2+3)   -> Score 3
                      4. (1+3)   -> Score 4
                      5. (2)     -> Score 5
                      6. (1)     -> Score 6
                      7. (3)     -> Score 7
                    */
                    let score = 99;
                    
                    if (hitModel && hitTag && hitPrompt) score = 1;
                    else if (hitModel && hitTag) score = 2;
                    else if (hitTag && hitPrompt) score = 3;
                    else if (hitModel && hitPrompt) score = 4;
                    else if (hitTag) score = 5;
                    else if (hitModel) score = 6;
                    else if (hitPrompt) score = 7;

                    results.push({ item: item, score: score });
                }
            });

            // 排序：先按 Score 升序，Score 相同按 ID 降序
            results.sort((a, b) => {
                if (a.score !== b.score) {
                    return a.score - b.score;
                } else {
                    return b.item.id - a.item.id;
                }
            });

            // 提取回纯数据数组
            galleryState.filteredData = results.map(r => r.item);

            updateSearchResultText(galleryState.filteredData.length, true);
            galleryState.currentPage = 1;
        }

        // --- 搜索提示逻辑 ---
        function setupSearchSuggestions() {
            const input = document.getElementById('search-input');
            const dropdown = document.getElementById('search-suggestions');

            // 渲染提示列表
            const renderSuggestions = () => {
                dropdown.innerHTML = "";
                PRESET_MODELS.forEach(model => {
                    const div = document.createElement('div');
                    div.className = 'suggestion-item';
                    div.innerHTML = `${model} <span class="suggestion-label">Model</span>`;
                    div.onmousedown = (e) => {
                        e.preventDefault(); // 防止 input 失去焦点
                        input.value = model;
                        dropdown.style.display = 'none';
                        document.getElementById('search-btn').click();
                    };
                    dropdown.appendChild(div);
                });
            };

            // 聚焦时显示
            input.onfocus = () => {
                renderSuggestions();
                dropdown.style.display = 'block';
            };

            // 失去焦点时隐藏 (延迟一点点，否则点击选项无法触发)
            input.onblur = () => {
                setTimeout(() => {
                    dropdown.style.display = 'none';
                }, 200);
            };



            // 监听输入，这里选择不依输入过滤，始终展示推荐 Model，方便用户点击
        }

        function updateSearchResultText(count, isSearch) {
            const info = document.getElementById('search-result-info');
            info.innerText = isSearch ? `搜索结果：${count} 个` : `共 ${count} 个结果`;
        }

        // --- 渲染画廊 ---
        function renderGallery() {
            const listContainer = document.getElementById('gallery-list');
            listContainer.innerHTML = "";

            const totalData = galleryState.filteredData;
            const totalPages = Math.ceil(totalData.length / PAGE_SIZE);
            
            if (galleryState.currentPage < 1) galleryState.currentPage = 1;
            if (galleryState.currentPage > totalPages && totalPages > 0) galleryState.currentPage = totalPages;

            const startIdx = (galleryState.currentPage - 1) * PAGE_SIZE;
            const endIdx = startIdx + PAGE_SIZE;
            const pageData = totalData.slice(startIdx, endIdx);

            if (pageData.length === 0) {
                listContainer.style.display = 'block';
                listContainer.innerHTML = "<div style='text-align:center; color:var(--text-muted); padding:50px;'>暂无内容</div>";
                renderPagination(0);
                // 更新URL
                const url = new URL(window.location);
                
                if (galleryState.searchQuery) url.searchParams.set('search', galleryState.searchQuery);
                window.history.replaceState({}, '', url);
                return;
            } else {
                listContainer.style.display = 'grid';
            }

            pageData.forEach(item => {
                const el = document.createElement('div');
                el.className = 'gallery-item';
                // 悬停显示更多信息
                const modelStr = item.model ? `Model: ${item.model.join(', ')}\n` : "";
                el.title = `ID: ${item.id}\n${modelStr}${item.prompt ? item.prompt.substring(0, 150) + "..." : ""}`;
                
                el.onclick = () => { window.location.href = `?id=${item.id}`; };

                if (item.img && item.img.length > 0) {
                    const img = document.createElement('img');
                    img.src = item.img[0];
                    img.loading = "lazy";
                    el.appendChild(img);
                    if (item.img.length > 1) {
                        const badge = document.createElement('span');
                        badge.className = 'img-count-badge';
                        badge.innerText = item.img.length;
                        el.appendChild(badge);
                    }
                } else {
                    el.innerHTML = "<div style='height:100%; display:flex; align-items:center; justify-content:center; color:var(--text-muted); font-size:0.8em;'>无图片</div>";
                }
                listContainer.appendChild(el);
            });
            renderPagination(totalPages);
            
            
            // 更新URL
            const url = new URL(window.location);
            
            if (galleryState.searchQuery) url.searchParams.set('search', galleryState.searchQuery);
            url.searchParams.set('page', galleryState.currentPage);
            url.searchParams.delete('id');
            window.history.replaceState({}, '', url);
        }

        function renderPagination(totalPages) {
            // (代码与之前一致，省略部分重复逻辑，保持功能)
            const pgInfo = document.getElementById('pg-info');
            pgInfo.innerText = `${galleryState.currentPage} / ${totalPages}`;
            const btns = {
                first: document.getElementById('pg-first'),
                prev: document.getElementById('pg-prev'),
                next: document.getElementById('pg-next'),
                last: document.getElementById('pg-last')
            };
            const toggleBtn = (btn, condition) => {
                if(condition) btn.classList.add('disabled'); else btn.classList.remove('disabled');
            };
            toggleBtn(btns.first, galleryState.currentPage <= 1);
            toggleBtn(btns.prev, galleryState.currentPage <= 1);
            toggleBtn(btns.next, galleryState.currentPage >= totalPages);
            toggleBtn(btns.last, galleryState.currentPage >= totalPages);

            btns.first.onclick = () => changePage(1);
            btns.prev.onclick = () => changePage(galleryState.currentPage - 1);
            btns.next.onclick = () => changePage(galleryState.currentPage + 1);
            btns.last.onclick = () => changePage(totalPages);
            document.getElementById('pg-go').onclick = () => {
                const val = parseInt(document.getElementById('pg-jump-input').value);
                if (val >= 1 && val <= totalPages) changePage(val);
            };
        }

        function changePage(pageNum) {
            galleryState.currentPage = pageNum;
            renderGallery();
            window.scrollTo(0, 0);
        }

        // --- 详情页逻辑 ---
        function renderDetailPage(id) {
            const item = allData.find(d => d.id === id);
            if (!item || !item.visible) {
                document.getElementById('detail-msg').innerText = "内容不存在";
                document.getElementById('detail-msg').style.display = 'block';
                return;
            }
            
            // 1. 渲染 Model (Tag 上方)
            const modelArea = document.getElementById('sidebar-models');
            modelArea.innerHTML = "";
            if (item.model && item.model.length > 0) {
                item.model.forEach(m => {
                    const badge = document.createElement('span');
                    badge.className = 'model-badge';
                    badge.innerText = m;
                    badge.onclick = () => { window.location.href = `?search=${encodeURIComponent(m)}`; };
                    modelArea.appendChild(badge);
                });
            } else {
                modelArea.innerHTML = "<span style='color:var(--text-muted); font-size:0.8em'>无模型信息</span>";
            }

            // 2. 渲染 Tag
            const tagArea = document.getElementById('sidebar-tags');
            tagArea.innerHTML = "";
            if (item.tag && item.tag.length > 0) {
                item.tag.forEach(t => {
                    const a = document.createElement('a');
                    a.className = 'tag-link-detail';
                    a.innerText = '#' + t;
                    a.href = `?search=${encodeURIComponent(t)}`;
                    tagArea.appendChild(a);
                });
            } else {
                tagArea.innerHTML = "<span style='color:var(--text-muted); font-size:0.8em'>无标签</span>";
            }

            // 3. 图片
            const mainImg = document.getElementById('detail-main-image');
            let currentDetailImgIdx = 0;
            const updateDetailImg = () => {
                if (item.img && item.img.length > 0) {
                    mainImg.src = item.img[currentDetailImgIdx];
                    mainImg.style.display = 'block';
                } else {
                    mainImg.style.display = 'none';
                }
            };
            mainImg.onclick = () => {
                if(item.img && item.img.length > 1) {
                    currentDetailImgIdx = (currentDetailImgIdx + 1) % item.img.length;
                    updateDetailImg();
                }
            };
            mainImg.style.cursor = item.img && item.img.length > 1 ? "pointer" : "default";
            updateDetailImg();
            
            // 点击切换提示
            if(item.img.length > 1)
            {
                document.getElementById("switch-hint").style.display = "block";
            }
            else
            {
                document.getElementById("switch-hint").style.display = "none";
            }

            // 4. Prompt
            document.getElementById('detail-prompt').innerText = item.prompt;

            // 5. Note (Prompt 下方)
            const noteDiv = document.getElementById('detail-note');
            if (item.note) {
                noteDiv.style.display = 'block';
                noteDiv.innerText = "NOTE:\n" + item.note;
            } else {
                noteDiv.style.display = 'none';
            }
        }

        // --- 事件绑定 ---
        function setupEventHandlers() {
            document.getElementById('search-btn').onclick = () => {
                const val = document.getElementById('search-input').value.trim();
                galleryState.searchQuery = val;
                performSearch(val);
                renderGallery();
            };
            document.getElementById('search-input').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') document.getElementById('search-btn').click();
            });
        }

        function setupNavLinks(currentId) {
            document.getElementById('nav-random').onclick = (e) => {
                e.preventDefault();
                const visible = allData.filter(d => d.visible);
                if (visible.length) {
                    const rnd = visible[Math.floor(Math.random() * visible.length)];
                    window.location.href = `?id=${rnd.id}`;
                }
            };
            // Next 按钮逻辑省略，与前版一致
            const nextBtn = document.getElementById('nav-next');
            if(currentId !== null) {
                nextBtn.onclick = (e) => {
                    e.preventDefault();
                    let idx = allData.findIndex(d => d.id === currentId);
                    let nextIdx = idx + 1;
                    while(true){
                        if(nextIdx >= allData.length) nextIdx=0;
                        if(nextIdx === idx) break;
                        if(allData[nextIdx].visible) {
                             window.location.href=`?id=${allData[nextIdx].id}`; 
                             break; 
                        }
                        nextIdx++;
                    }
                }
            } else { nextBtn.style.display='none'; }
        }

        function getQueryParam(param) { return new URLSearchParams(window.location.search).get(param); }

        init();