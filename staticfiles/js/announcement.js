/* =========================================================
   CSRF TOKEN
========================================================= */

function getCookie(name) {

    let cookieValue = null;

    if (document.cookie && document.cookie !== '') {

        const cookies = document.cookie.split(';');

        for (let i = 0; i < cookies.length; i++) {

            const cookie = cookies[i].trim();

            if (cookie.startsWith(name + '=')) {

                cookieValue = decodeURIComponent(
                    cookie.substring(name.length + 1)
                );

                break;
            }
        }
    }

    return cookieValue;
}

/* =========================================================
   SHOW MODAL
========================================================= */

window.showAnnouncementModal = function () {

    const modal =
        document.getElementById(
            "announcementModal"
        );

    if (modal) {

        modal.style.display =
            "flex";
    }
};

/* =========================================================
   CLOSE MODAL
========================================================= */

window.closeAnnouncementModal = function () {

    const modal =
        document.getElementById(
            "announcementModal"
        );

    if (modal) {

        modal.style.display =
            "none";
    }
};

/* =========================================================
   CLOSE MODAL OUTSIDE CLICK
========================================================= */

window.addEventListener(
    "click",
    function (event) {

        const modal =
            document.getElementById(
                "announcementModal"
            );

        if (
            event.target === modal
        ) {

            modal.style.display =
                "none";
        }
    }
);

/* =========================================================
   SAVE ANNOUNCEMENT
========================================================= */

window.saveAnnouncement =
async function () {

    const text =
        document.getElementById(
            "announcementText"
        );

    const link =
        document.getElementById(
            "announcementLink"
        );

    const status =
        document.getElementById(
            "announcementStatus"
        );

    /* =========================================
       VALIDATION
    ========================================== */

    if (!text.value.trim()) {

        alert(
            "Please enter announcement text"
        );

        return;
    }

    /* =========================================
       FORMDATA
    ========================================== */

    const formData =
        new FormData();

    formData.append(
        "text",
        text.value
    );

    formData.append(
        "link",
        link.value
    );

    formData.append(
        "is_active",
        status.value
    );

    try {

        const csrftoken =
            getCookie(
                "csrftoken"
            );

        const response =
            await fetch(

                "/admin/announcements/",

                {

                    method: "POST",

                    headers: {

                        "X-CSRFToken":
                            csrftoken
                    },

                    body: formData
                }
            );

        /* =========================================
           SUCCESS
        ========================================== */

        if (
            response.status === 200
        ) {

            alert(
                "Announcement Added Successfully"
            );

            window.closeAnnouncementModal();

            window.location.reload();

        } else {

            alert(
                "Failed To Save Announcement"
            );

            console.log(
                await response.text()
            );
        }

    } catch (error) {

        console.log(
            error
        );

        alert(
            "Something Went Wrong"
        );
    }
};

/* =========================================================
   DELETE UI
========================================================= */

document
    .querySelectorAll(
        ".btn-delete-announcement"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            function () {

                const confirmDelete =
                    confirm(
                        "Delete this announcement?"
                    );

                if (confirmDelete) {

                    const card =
                        this.closest(
                            ".announcement-card"
                        );

                    card.style.opacity =
                        "0";

                    card.style.transform =
                        "scale(0.8)";

                    setTimeout(() => {

                        card.remove();

                    }, 300);
                }
            }
        );
    });

/* =========================================================
   EDIT UI
========================================================= */

document
    .querySelectorAll(
        ".btn-edit-announcement"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            function () {

                const card =
                    this.closest(
                        ".announcement-card"
                    );

                const text =
                    card.querySelector(
                        ".announcement-text"
                    ).innerText;

                const linkElement =
                    card.querySelector(
                        ".announcement-link"
                    );

                const statusElement =
                    card.querySelector(
                        ".status-active"
                    );

                document.getElementById(
                    "announcementText"
                ).value = text;

                document.getElementById(
                    "announcementLink"
                ).value =
                    linkElement
                    ? linkElement.innerText
                    : "";

                document.getElementById(
                    "announcementStatus"
                ).value =
                    statusElement
                    ? "true"
                    : "false";

                window.showAnnouncementModal();
            }
        );
    });

/* =========================================================
   CARD ENTRY ANIMATION
========================================================= */

const announcementCards =
    document.querySelectorAll(
        ".announcement-card"
    );

announcementCards.forEach(
    (card, index) => {

        card.style.opacity =
            "0";

        card.style.transform =
            "translateY(40px)";

        setTimeout(() => {

            card.style.transition =
                "0.5s ease";

            card.style.opacity =
                "1";

            card.style.transform =
                "translateY(0)";

        }, index * 120);
    }
);