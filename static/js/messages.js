/* ======================================================
   OPEN MESSAGE MODAL
====================================================== */

window.openMessageModal = function(
    name,
    email,
    phone,
    subject,
    message,
    date
){

    document.getElementById(
        "modalCustomer"
    ).innerText = name;

    document.getElementById(
        "modalEmail"
    ).innerText = email;

    document.getElementById(
        "modalPhone"
    ).innerText = phone || "-";

    document.getElementById(
        "modalSubject"
    ).innerText = subject;

    document.getElementById(
        "modalDate"
    ).innerText = date;

    document.getElementById(
        "modalMessage"
    ).innerText = message;

    document.getElementById(
        "messageModal"
    ).style.display = "flex";
};

/* ======================================================
   CLOSE MESSAGE MODAL
====================================================== */

window.closeMessageModal = function(){

    document.getElementById(
        "messageModal"
    ).style.display = "none";
};

/* ======================================================
   CLOSE MODAL ON OUTSIDE CLICK
====================================================== */

window.addEventListener(
    "click",
    function(e){

        const modal =
            document.getElementById(
                "messageModal"
            );

        if(e.target === modal){

            modal.style.display = "none";
        }

    }
);

/* ======================================================
   DELETE MESSAGE
====================================================== */

window.deleteMessage = async function(
    messageId
){

    const confirmDelete =
        confirm(
            "Delete this message?"
        );

    if(!confirmDelete){

        return;
    }

    try{

        const response =
            await fetch(

                `/api/delete-message/${messageId}/`,

                {

                    method:"DELETE",

                    headers:{
                        "Content-Type":
                        "application/json"
                    }

                }

            );

        const data =
            await response.json();

        console.log(data);

        if(data.status === "success"){

            location.reload();

        }
        else{

            alert(
                "Delete failed!"
            );
        }

    }

    catch(error){

        console.log(
            "Delete Error:",
            error
        );

        alert(
            "Something went wrong!"
        );

    }

};