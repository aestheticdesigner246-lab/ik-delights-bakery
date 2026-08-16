function searchCustomers(){

    let input = document
        .getElementById("customerSearch")
        .value
        .toLowerCase();

    let rows = document
        .querySelectorAll("#customersTableBody tr");

    rows.forEach(row => {

        row.style.display =
            row.innerText.toLowerCase().includes(input)

            ? ""

            : "none";

    });

}



async function deleteCustomer(id){

    if(!confirm("Delete customer?")){
        return;
    }

    const response = await fetch(

        `/admin/customers/delete/${id}/`,

        {
            method:'POST',

            headers:{
                'X-CSRFToken': getCookie('csrftoken')
            }
        }
    );

    const data = await response.json();

    if(data.status === 'ok'){

        document
            .getElementById(`customer-${id}`)
            .remove();

    }

}



async function editCustomer(
    id,
    oldPhone,
    oldCity,
    oldAddress
){

    const newPhone = prompt(
        "Edit Phone",
        oldPhone
    );

    if(newPhone === null){
        return;
    }

    const newCity = prompt(
        "Edit City",
        oldCity
    );

    if(newCity === null){
        return;
    }

    const newAddress = prompt(
        "Edit Address",
        oldAddress
    );

    if(newAddress === null){
        return;
    }

    const response = await fetch(

        `/admin/customers/update/${id}/`,

        {
            method:'PUT',

            headers:{
                'Content-Type':'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },

            body:JSON.stringify({

                phone:newPhone,
                city:newCity,
                address:newAddress

            })
        }
    );

    const data = await response.json();

    if(data.status === 'ok'){

        location.reload();

    }

}



function viewCustomer(
    username,
    phone,
    city,
    address,
    orders
){

    alert(

`Customer Details

Username: ${username}

Phone: ${phone}

City: ${city}

Address: ${address}

Total Orders: ${orders}`

    );

}



function getCookie(name){

    let cookieValue = null;

    if(document.cookie && document.cookie !== ''){

        const cookies = document.cookie.split(';');

        for(let i = 0; i < cookies.length; i++){

            const cookie = cookies[i].trim();

            if(cookie.substring(
                0,
                name.length + 1
            ) === (name + '=')){

                cookieValue = decodeURIComponent(
                    cookie.substring(name.length + 1)
                );

                break;

            }

        }

    }

    return cookieValue;
}