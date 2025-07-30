// ==UserScript==
// @name         STACKIT Portal Efficiency
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Adds efficient functions to the STACKIT Portal
// @author       Timo Bergen
// @match        https://portal.stackit.cloud/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=stackit.cloud
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function() {
    'use strict';

    // --- Configuration & SVG Icons ---
    const navMenuSelector = 'stackit-navigation-menu div.menu.no-focus';
    const STAR_OUTLINE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 1rem; height: 1rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 21.1a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>`;
    const STAR_FILLED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width: 1rem; height: 1rem; color: #ffc107;"><path fill-rule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clip-rule="evenodd" /></svg>`;
    let favorites = [];
    let setupCompleted = false;

    /** Injects CSS for hover effects and star positioning. */
    function injectStyles() {
        if (document.getElementById('stackit-favorites-styles')) return;
        const style = document.createElement('style');
        style.id = 'stackit-favorites-styles';
        style.textContent = `
            .nav-item { position: relative; }
            .favorite-star-btn {
                position: absolute; right: 1rem; top: 50%;
                transform: translateY(-50%); cursor: pointer;
                opacity: 0; transition: opacity 0.2s ease-in-out;
                z-index: 10; padding: 4px; border-radius: 4px;
            }
            .nav-item:hover .favorite-star-btn { opacity: 1; }
            .favorite-star-btn:hover { background-color: rgba(0,0,0,0.1); }
            /* Make stars in the favorites list always visible */
            #favorites-nav-section .favorite-star-btn { opacity: 0.6; }
            #favorites-nav-section .nav-item:hover .favorite-star-btn { opacity: 1; }
        `;
        document.head.appendChild(style);
    }

    /** Loads favorites from Tampermonkey's storage. */
    async function loadFavorites() {
        favorites = JSON.parse(await GM_getValue('stackit_favorites', '[]'));
    }

    /** Saves favorites to Tampermonkey's storage. */
    async function saveFavorites() {
        await GM_setValue('stackit_favorites', JSON.stringify(favorites));
    }

    /** Draws the "Favorites" section at the top of the nav menu. */
    function renderFavoritesSection() {
        document.getElementById('favorites-nav-section')?.remove();
        if (favorites.length === 0) return;

        const projectId = getProjectId();
        const listItemsHTML = favorites.map(link => {
            const finalHref = projectId ? link.urlPattern.replace('{{PROJECT_ID}}', projectId) : '#';
            // ### THIS IS THE FIX ###
            // The data attribute is now data-link-id to match what the handler expects.
            return `
                <li class="nav-item ng-star-inserted" data-favorite-id="${link.id}">
                    <a role="link" class="d-flex align-items-center text-truncate" title="${link.name}" href="${finalHref}">
                        <stackit-icon size="20" class="d-block icon ng-star-inserted" style="width: 1.25rem; height: 1.25rem; min-width: 1.25rem;">${link.iconSVG}</stackit-icon>
                        <span class="text-wrap">${link.name}</span>
                    </a>
                    <span class="favorite-star-btn" data-link-id="${link.id}" title="Remove from Favorites">
                        ${STAR_FILLED_SVG}
                    </span>
                </li>`;
        }).join('');

        const favoritesSectionHTML = `
            <div class="nav-section ng-star-inserted" id="favorites-nav-section">
                <h6 class="ng-star-inserted">Favorites</h6>
                <ul class="mb-0">${listItemsHTML}</ul>
                <hr aria-hidden="true" tabindex="-1">
            </div>`;

        document.querySelector(navMenuSelector)?.insertAdjacentHTML('afterbegin', favoritesSectionHTML);

        // Attach event listeners to the new "unfavorite" buttons
        document.querySelectorAll('#favorites-nav-section .favorite-star-btn').forEach(btn => {
            btn.addEventListener('click', handleFavoriteToggle);
        });
    }

    /** Central handler for adding/removing favorites. */
    async function handleFavoriteToggle(event) {
        event.preventDefault();
        event.stopPropagation();

        const button = event.currentTarget;
        const linkId = button.dataset.linkId; // Reads data-link-id
        const linkData = JSON.parse(button.dataset.linkData || 'null');
        const isFavorited = favorites.some(fav => fav.id === linkId);

        if (isFavorited) {
            favorites = favorites.filter(fav => fav.id !== linkId);
        } else if (linkData) {
            favorites.push(linkData);
        }

        await saveFavorites();
        renderFavoritesSection();
        updateAllStarIcons();
    }

    /** Updates all star icons to show the correct state (filled or outline). */
    function updateAllStarIcons() {
        document.querySelectorAll('.favorite-star-btn').forEach(btn => {
            const linkId = btn.dataset.linkId;
            const isFavorited = favorites.some(fav => fav.id === linkId);
            // Only update the stars in the main list (not the filled ones in the favorites section)
            if (!btn.closest('#favorites-nav-section')) {
                 btn.innerHTML = isFavorited ? STAR_FILLED_SVG : STAR_OUTLINE_SVG;
            }
        });
    }

    /** Finds the project ID (UUID) from the URL. */
    function getProjectId() {
        const match = window.location.href.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        return match ? match[0] : null;
    }

    /** Main function to initialize the favorites system. */
    async function initializeFavorites() {
        if (setupCompleted) return true;
        const navContainer = document.querySelector(navMenuSelector);
        if (!navContainer || !navContainer.querySelector('.nav-item')) return false;

        console.log('Tampermonkey: Initializing STACKIT Favorites');
        injectStyles();
        await loadFavorites();
        renderFavoritesSection();

        const projectId = getProjectId();
        document.querySelectorAll(`${navMenuSelector} .nav-section:not(#favorites-nav-section) .nav-item`).forEach(item => {
            const link = item.querySelector('a');
            const icon = item.querySelector('stackit-icon svg');
            if (!link || !link.id || item.querySelector('.favorite-star-btn')) return;

            const linkData = {
                id: link.id,
                name: link.title,
                urlPattern: projectId ? link.getAttribute('href').replace(projectId, '{{PROJECT_ID}}') : link.getAttribute('href'),
                iconSVG: icon ? icon.outerHTML : ''
            };

            const starBtn = document.createElement('span');
            starBtn.className = 'favorite-star-btn';
            starBtn.dataset.linkId = linkData.id;
            starBtn.dataset.linkData = JSON.stringify(linkData); // Store all data needed to add it
            starBtn.addEventListener('click', handleFavoriteToggle);

            item.appendChild(starBtn);
        });

        updateAllStarIcons();
        setupCompleted = true;
        return true;
    }

    // --- Run Script ---
    const interval = setInterval(() => {
        initializeFavorites().then(success => {
            if (success) clearInterval(interval);
        });
    }, 750);

})();