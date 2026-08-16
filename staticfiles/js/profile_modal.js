function initProfileTabs() {

    const buttons = document.querySelectorAll(".tab-btn");
    const tabs = document.querySelectorAll(".tab-content");

    console.log("Buttons Found:", buttons.length);

    buttons.forEach((button) => {

        button.onclick = function () {

            console.log("Clicked:", this.dataset.tab);

            // REMOVE ACTIVE FROM ALL BUTTONS
            buttons.forEach((btn) => {
                btn.classList.remove("active");
            });

            // HIDE ALL TABS
            tabs.forEach((tab) => {
                tab.classList.remove("active");
            });

            // ACTIVE BUTTON
            this.classList.add("active");

            // OPEN TAB
            const tabId = this.dataset.tab;

            const targetTab =
                document.getElementById(tabId);

            if (targetTab) {
                targetTab.classList.add("active");
            }

        };

    });

}

// WAIT FOR MODAL LOAD
setTimeout(() => {
    initProfileTabs();
}, 1000);